const MONTHS = {
  janvier: 0,
  fevrier: 1,
  février: 1,
  mars: 2,
  avril: 3,
  mai: 4,
  juin: 5,
  juillet: 6,
  aout: 7,
  août: 7,
  septembre: 8,
  octobre: 9,
  novembre: 10,
  decembre: 11,
  décembre: 11
};

function normalizeText(value = "") {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function roundAmount(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? Math.round(number * 100) / 100 : 0;
}

function monthLabel(monthIndex) {
  return [
    "janvier",
    "fevrier",
    "mars",
    "avril",
    "mai",
    "juin",
    "juillet",
    "aout",
    "septembre",
    "octobre",
    "novembre",
    "decembre"
  ][monthIndex];
}

function formatCurrency(value, currency = "MGA") {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency,
    maximumFractionDigits: 0
  }).format(Number(value || 0));
}

function parseMonthYear(question) {
  const normalized = normalizeText(question);
  const match = normalized.match(
    /\b(janvier|fevrier|mars|avril|mai|juin|juillet|aout|septembre|octobre|novembre|decembre)\s+(20\d{2})\b/
  );

  if (!match) {
    return null;
  }

  return {
    month: MONTHS[match[1]],
    year: Number(match[2])
  };
}

function salesForMonth(store, month, year) {
  return store.sales.filter((sale) => {
    const date = new Date(sale.createdAt);
    return date.getUTCFullYear() === year && date.getUTCMonth() === month;
  });
}

function computeMonthlyMargin(store, month, year) {
  const sales = salesForMonth(store, month, year);
  const productsById = new Map(store.products.map((product) => [product.id, product]));
  let revenue = 0;
  let estimatedCost = 0;
  let serviceRevenue = 0;

  sales.forEach((sale) => {
    sale.items.forEach((item) => {
      revenue += roundAmount(item.total);

      if (item.kind === "product") {
        const fallbackCost = productsById.get(item.refId)?.costPrice || 0;
        const unitCost = roundAmount(item.costPriceSnapshot ?? fallbackCost);
        estimatedCost += roundAmount(unitCost * item.quantity);
      } else if (item.kind === "service") {
        serviceRevenue += roundAmount(item.total);
      }
    });
  });

  return {
    salesCount: sales.length,
    revenue: roundAmount(revenue),
    estimatedCost: roundAmount(estimatedCost),
    serviceRevenue: roundAmount(serviceRevenue),
    grossMargin: roundAmount(revenue - estimatedCost)
  };
}

function computeStockSaleValue(store) {
  const lineCount = store.products.length;
  const quantityTotal = store.products.reduce(
    (sum, product) => sum + Number(product.stockOnHand || 0),
    0
  );
  const projectedRevenue = store.products.reduce(
    (sum, product) => sum + Number(product.stockOnHand || 0) * Number(product.salePrice || 0),
    0
  );

  return {
    lineCount,
    quantityTotal,
    projectedRevenue: roundAmount(projectedRevenue)
  };
}

function computeTopProduct(store, month, year) {
  const aggregate = new Map();

  salesForMonth(store, month, year).forEach((sale) => {
    sale.items
      .filter((item) => item.kind === "product")
      .forEach((item) => {
        const current = aggregate.get(item.refId) || {
          productId: item.refId,
          label: item.label,
          quantity: 0,
          revenue: 0
        };
        current.quantity += Number(item.quantity || 0);
        current.revenue += Number(item.total || 0);
        aggregate.set(item.refId, current);
      });
  });

  const ranking = [...aggregate.values()].sort((left, right) => {
    if (right.quantity !== left.quantity) {
      return right.quantity - left.quantity;
    }
    return right.revenue - left.revenue;
  });

  return ranking[0] || null;
}

function buildUnsupportedAnswer() {
  return {
    intent: "unsupported",
    answer:
      "Je peux repondre pour l'instant a la marge mensuelle, a la valeur de vente theorique du stock et au produit le plus vendu sur un mois donne.",
    data: null
  };
}

function processAssistantQuery(store, question) {
  const normalized = normalizeText(question);
  const period = parseMonthYear(question);
  const currency = store.settings.currency || "MGA";

  if (!normalized) {
    return {
      intent: "empty",
      answer: "Pose une question metier comme : marge de fevrier 2026 ou produit le plus vendu en janvier 2026.",
      data: null
    };
  }

  if (
    normalized.includes("marge") &&
    (normalized.includes("mois") || period)
  ) {
    if (!period) {
      return {
        intent: "monthly_margin_missing_period",
        answer: "Precise le mois et l'annee, par exemple : marge mensuelle de fevrier 2026.",
        data: null
      };
    }

    const result = computeMonthlyMargin(store, period.month, period.year);
    return {
      intent: "monthly_margin",
      answer:
        `La marge brute pour ${monthLabel(period.month)} ${period.year} est de ` +
        `${formatCurrency(result.grossMargin, currency)}. ` +
        `Chiffre d'affaires: ${formatCurrency(result.revenue, currency)}, ` +
        `cout estime des produits vendus: ${formatCurrency(result.estimatedCost, currency)}, ` +
        `prestations incluses: ${formatCurrency(result.serviceRevenue, currency)}.`,
      data: {
        period,
        ...result
      }
    };
  }

  if (
    (normalized.includes("prix de vente") || normalized.includes("valeur de vente")) &&
    normalized.includes("stock")
  ) {
    const result = computeStockSaleValue(store);
    return {
      intent: "stock_sale_value",
      answer:
        `La valeur de vente theorique du stock actuel est de ` +
        `${formatCurrency(result.projectedRevenue, currency)} ` +
        `pour ${result.lineCount} produit(s) et ${result.quantityTotal} unite(s) en stock.`,
      data: result
    };
  }

  if (
    (normalized.includes("plus vendu") ||
      normalized.includes("meilleur vente") ||
      normalized.includes("top produit")) &&
    normalized.includes("produit")
  ) {
    if (!period) {
      return {
        intent: "top_product_missing_period",
        answer: "Precise le mois et l'annee, par exemple : produit le plus vendu en fevrier 2026.",
        data: null
      };
    }

    const top = computeTopProduct(store, period.month, period.year);

    if (!top) {
      return {
        intent: "top_product_empty",
        answer: `Aucune vente de produit n'a ete trouvee pour ${monthLabel(period.month)} ${period.year}.`,
        data: {
          period
        }
      };
    }

    return {
      intent: "top_product_month",
      answer:
        `Le produit le plus vendu en ${monthLabel(period.month)} ${period.year} est ` +
        `${top.label} avec ${top.quantity} unite(s) vendue(s) pour ` +
        `${formatCurrency(top.revenue, currency)} de chiffre d'affaires.`,
      data: {
        period,
        ...top
      }
    };
  }

  return buildUnsupportedAnswer();
}

module.exports = {
  processAssistantQuery
};
