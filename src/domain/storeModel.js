const crypto = require("crypto");

const STORE_VERSION = 3;

const DEFAULT_PRODUCT_CATEGORIES = [
  "Fournitures scolaires",
  "Papeterie",
  "Papiers",
  "Informatique",
  "Divers"
];

const DEFAULT_SERVICE_CATEGORIES = [
  "Impression",
  "Photocopie",
  "Plastification",
  "Reliure",
  "Saisie",
  "Divers"
];

const DEFAULT_PAYMENT_METHODS = ["cash", "mobile_money", "card", "mixed"];

function createId() {
  return crypto.randomUUID();
}

function nowIso() {
  return new Date().toISOString();
}

function roundAmount(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? Math.round(number * 100) / 100 : 0;
}

function parseNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function createDefaultStore() {
  const now = nowIso();

  return {
    meta: {
      version: STORE_VERSION,
      createdAt: now,
      updatedAt: now
    },
    settings: {
      businessName: "GestionComV2",
      currency: "MGA",
      lowStockThreshold: 5
    },
    catalog: {
      productCategories: [...DEFAULT_PRODUCT_CATEGORIES],
      serviceCategories: [...DEFAULT_SERVICE_CATEGORIES],
      paymentMethods: [...DEFAULT_PAYMENT_METHODS]
    },
    products: [],
    services: [],
    stockMovements: [],
    sales: [],
    cashEntries: [],
    activityLog: []
  };
}

function ensureUnique(values) {
  return [...new Set(values.filter(Boolean).map((value) => String(value).trim()))];
}

function normalizeProduct(rawProduct = {}) {
  const now = nowIso();
  const stockOnHand = parseNumber(
    rawProduct.stockOnHand ?? rawProduct.quantity ?? 0,
    0
  );
  const reorderLevel = parseNumber(rawProduct.reorderLevel, 5);
  const costPrice = roundAmount(rawProduct.costPrice ?? rawProduct.unitCost ?? 0);
  const purchaseTotalPrice = roundAmount(
    rawProduct.purchaseTotalPrice ?? costPrice * Math.max(0, stockOnHand)
  );

  return {
    id: rawProduct.id || createId(),
    sku: String(rawProduct.sku || "").trim(),
    name: String(rawProduct.name || "").trim(),
    category: String(rawProduct.category || "Divers").trim(),
    unit: String(rawProduct.unit || "piece").trim() || "piece",
    salePrice: roundAmount(rawProduct.salePrice ?? rawProduct.unitPrice ?? 0),
    costPrice,
    purchaseTotalPrice,
    stockOnHand: Math.max(0, stockOnHand),
    reorderLevel: Math.max(0, reorderLevel),
    isActive: rawProduct.isActive !== false,
    createdAt: rawProduct.createdAt || now,
    updatedAt: rawProduct.updatedAt || now
  };
}

function normalizeService(rawService = {}) {
  const now = nowIso();

  return {
    id: rawService.id || createId(),
    code: String(rawService.code || "").trim(),
    name: String(rawService.name || "").trim(),
    category: String(rawService.category || "Divers").trim(),
    basePrice: roundAmount(rawService.basePrice ?? rawService.price ?? 0),
    isActive: rawService.isActive !== false,
    createdAt: rawService.createdAt || now,
    updatedAt: rawService.updatedAt || now
  };
}

function normalizeMovement(rawMovement = {}) {
  return {
    id: rawMovement.id || createId(),
    productId: String(rawMovement.productId || "").trim(),
    type: String(rawMovement.type || "adjustment").trim(),
    quantityDelta: parseNumber(rawMovement.quantityDelta, 0),
    unitCost: roundAmount(rawMovement.unitCost ?? 0),
    note: String(rawMovement.note || "").trim(),
    referenceId: rawMovement.referenceId || null,
    createdAt: rawMovement.createdAt || nowIso()
  };
}

function normalizeCashEntry(rawEntry = {}) {
  return {
    id: rawEntry.id || createId(),
    type: String(rawEntry.type || "sale").trim(),
    direction: rawEntry.direction === "out" ? "out" : "in",
    amount: roundAmount(rawEntry.amount),
    paymentMethod: String(rawEntry.paymentMethod || "cash").trim(),
    label: String(rawEntry.label || "").trim(),
    referenceId: rawEntry.referenceId || null,
    createdAt: rawEntry.createdAt || nowIso()
  };
}

function normalizeActivity(rawActivity = {}) {
  return {
    id: rawActivity.id || createId(),
    type: String(rawActivity.type || "system").trim(),
    label: String(rawActivity.label || "").trim(),
    details: String(rawActivity.details || "").trim(),
    createdAt: rawActivity.createdAt || nowIso()
  };
}

function normalizeSale(rawSale = {}) {
  return {
    id: rawSale.id || createId(),
    reference: String(rawSale.reference || "").trim(),
    customerName: String(rawSale.customerName || "Client comptoir").trim(),
    paymentMethod: String(rawSale.paymentMethod || "cash").trim(),
    status: String(rawSale.status || "paid").trim(),
    items: Array.isArray(rawSale.items)
      ? rawSale.items.map((item) => ({
          id: item.id || createId(),
          kind: String(item.kind || "").trim(),
          refId: String(item.refId || "").trim(),
          label: String(item.label || "").trim(),
          quantity: parseNumber(item.quantity, 0),
          unit: String(item.unit || "").trim(),
          unitPrice: roundAmount(item.unitPrice),
          total: roundAmount(item.total),
          costPriceSnapshot: roundAmount(item.costPriceSnapshot ?? 0)
        }))
      : [],
    subtotal: roundAmount(rawSale.subtotal),
    amountPaid: roundAmount(rawSale.amountPaid ?? rawSale.subtotal ?? 0),
    balanceDue: roundAmount(rawSale.balanceDue ?? 0),
    createdAt: rawSale.createdAt || nowIso(),
    updatedAt: rawSale.updatedAt || rawSale.createdAt || nowIso()
  };
}

function migrateLegacyStore(rawStore = {}) {
  const baseStore = createDefaultStore();
  const now = nowIso();

  const legacyProducts = Array.isArray(rawStore.inventory)
    ? rawStore.inventory.map((item) =>
        normalizeProduct({
          ...item,
          salePrice: item.unitPrice,
          stockOnHand: item.quantity
        })
      )
    : [];

  const legacyServices = Array.isArray(rawStore.services)
    ? rawStore.services.map((service) =>
        normalizeService({
          ...service,
          basePrice: service.price
        })
      )
    : [];

  const legacyActivities = Array.isArray(rawStore.transactions)
    ? rawStore.transactions.map((transaction) =>
        normalizeActivity({
          type: transaction.type || "legacy",
          label: transaction.label || "Historique importe",
          details: "Donnee migree depuis le format initial.",
          createdAt: transaction.createdAt
        })
      )
    : [];

  return {
    ...baseStore,
    meta: {
      version: STORE_VERSION,
      createdAt: rawStore.meta?.createdAt || now,
      updatedAt: rawStore.meta?.updatedAt || now
    },
    products: legacyProducts,
    services: legacyServices,
    activityLog: legacyActivities
  };
}

function normalizeStore(rawStore = {}) {
  if (!rawStore.meta?.version || rawStore.meta.version < STORE_VERSION) {
    rawStore = migrateLegacyStore(rawStore);
  }

  const baseStore = createDefaultStore();
  const productCategories = ensureUnique([
    ...baseStore.catalog.productCategories,
    ...(rawStore.catalog?.productCategories || []),
    ...((rawStore.products || []).map((product) => product.category))
  ]);
  const serviceCategories = ensureUnique([
    ...baseStore.catalog.serviceCategories,
    ...(rawStore.catalog?.serviceCategories || []),
    ...((rawStore.services || []).map((service) => service.category))
  ]);
  const paymentMethods = ensureUnique([
    ...baseStore.catalog.paymentMethods,
    ...(rawStore.catalog?.paymentMethods || [])
  ]);

  return {
    meta: {
      version: STORE_VERSION,
      createdAt: rawStore.meta?.createdAt || baseStore.meta.createdAt,
      updatedAt: rawStore.meta?.updatedAt || baseStore.meta.updatedAt
    },
    settings: {
      ...baseStore.settings,
      ...(rawStore.settings || {})
    },
    catalog: {
      productCategories,
      serviceCategories,
      paymentMethods
    },
    products: (rawStore.products || []).map(normalizeProduct),
    services: (rawStore.services || []).map(normalizeService),
    stockMovements: (rawStore.stockMovements || []).map(normalizeMovement),
    sales: (rawStore.sales || []).map(normalizeSale),
    cashEntries: (rawStore.cashEntries || []).map(normalizeCashEntry),
    activityLog: (rawStore.activityLog || []).map(normalizeActivity)
  };
}

function addActivity(store, type, label, details) {
  return [
    normalizeActivity({
      type,
      label,
      details
    }),
    ...store.activityLog
  ];
}

function buildReference(prefix, count) {
  return `${prefix}-${String(count + 1).padStart(4, "0")}`;
}

function addProduct(store, payload = {}) {
  const name = String(payload.name || "").trim();
  const category = String(payload.category || "").trim();

  if (!name) {
    throw new Error("Le nom du produit est obligatoire.");
  }

  if (!category) {
    throw new Error("La categorie du produit est obligatoire.");
  }

  const product = normalizeProduct({
    ...payload,
    name,
    category,
    stockOnHand: 0
  });

  if (
    store.products.some(
      (entry) => entry.name.toLowerCase() === product.name.toLowerCase()
    )
  ) {
    throw new Error("Un produit avec ce nom existe deja.");
  }

  return {
    ...store,
    catalog: {
      ...store.catalog,
      productCategories: ensureUnique([...store.catalog.productCategories, category])
    },
    products: [product, ...store.products],
    activityLog: addActivity(
      store,
      "product_created",
      product.name,
      "Produit ajoute au catalogue."
    )
  };
}

function addService(store, payload = {}) {
  const name = String(payload.name || "").trim();

  if (!name) {
    throw new Error("Le nom du service est obligatoire.");
  }

  const service = normalizeService({
    ...payload,
    name,
    category: String(payload.category || "Divers").trim()
  });

  return {
    ...store,
    catalog: {
      ...store.catalog,
      serviceCategories: ensureUnique([
        ...store.catalog.serviceCategories,
        service.category
      ])
    },
    services: [service, ...store.services],
    activityLog: addActivity(
      store,
      "service_created",
      service.name,
      "Service ajoute au catalogue."
    )
  };
}

function receiveStock(store, payload = {}) {
  const productId = String(payload.productId || "").trim();
  const quantity = parseNumber(payload.quantity, 0);
  const unitCost = roundAmount(payload.unitCost);
  const note = String(payload.note || payload.supplier || "").trim();

  if (!productId) {
    throw new Error("Le produit est obligatoire.");
  }

  if (quantity <= 0) {
    throw new Error("La quantite recue doit etre positive.");
  }

  const index = store.products.findIndex((product) => product.id === productId);

  if (index === -1) {
    throw new Error("Produit introuvable.");
  }

  const product = store.products[index];
  const updatedProduct = {
    ...product,
    costPrice: unitCost || product.costPrice,
    stockOnHand: roundAmount(product.stockOnHand + quantity),
    updatedAt: nowIso()
  };
  const movement = normalizeMovement({
    productId,
    type: "purchase",
    quantityDelta: quantity,
    unitCost,
    note
  });
  const cashEntry = unitCost
    ? normalizeCashEntry({
        type: "stock_purchase",
        direction: "out",
        amount: roundAmount(quantity * unitCost),
        paymentMethod: String(payload.paymentMethod || "cash").trim(),
        label: `Approvisionnement ${product.name}`,
        referenceId: movement.id
      })
    : null;

  const products = [...store.products];
  products[index] = updatedProduct;

  return {
    ...store,
    products,
    stockMovements: [movement, ...store.stockMovements],
    cashEntries: cashEntry ? [cashEntry, ...store.cashEntries] : store.cashEntries,
    activityLog: addActivity(
      store,
      "stock_received",
      product.name,
      `${quantity} ${product.unit} ajoute(s) au stock.`
    )
  };
}

function commitSale(store, payload = {}, options = {}) {
  const items = Array.isArray(payload.items) ? payload.items : [];

  if (!items.length) {
    throw new Error("Une vente doit contenir au moins une ligne.");
  }

  const productsById = new Map(store.products.map((product) => [product.id, product]));
  const servicesById = new Map(store.services.map((service) => [service.id, service]));
  const updatedProducts = new Map();
  const saleItems = items.map((item) => {
    const kind = String(item.kind || "").trim();
    const quantity = parseNumber(item.quantity, 0);

    if (!["product", "service"].includes(kind)) {
      throw new Error("Type de ligne de vente invalide.");
    }

    if (quantity <= 0) {
      throw new Error("La quantite de chaque ligne doit etre positive.");
    }

    if (kind === "product") {
      const productId = String(item.productId || "").trim();
      const product = productsById.get(productId);

      if (!product) {
        throw new Error("Un produit de la vente est introuvable.");
      }

      const currentProduct = updatedProducts.get(productId) || product;
      if (currentProduct.stockOnHand < quantity) {
        throw new Error(`Stock insuffisant pour ${product.name}.`);
      }

      const nextProduct = {
        ...currentProduct,
        stockOnHand: roundAmount(currentProduct.stockOnHand - quantity),
        updatedAt: nowIso()
      };

      updatedProducts.set(productId, nextProduct);

      return {
        id: createId(),
        kind: "product",
        refId: product.id,
        label: product.name,
        quantity,
        unit: product.unit,
        unitPrice: roundAmount(item.unitPrice ?? product.salePrice),
        total: roundAmount(quantity * (item.unitPrice ?? product.salePrice)),
        costPriceSnapshot: roundAmount(product.costPrice)
      };
    }

    const serviceId = String(item.serviceId || "").trim();
    const service = servicesById.get(serviceId);

    if (!service) {
      throw new Error("Un service de la vente est introuvable.");
    }

    return {
      id: createId(),
      kind: "service",
      refId: service.id,
      label: service.name,
      quantity,
      unit: "service",
      unitPrice: roundAmount(item.unitPrice ?? service.basePrice),
      total: roundAmount(quantity * (item.unitPrice ?? service.basePrice)),
      costPriceSnapshot: 0
    };
  });

  const subtotal = roundAmount(
    saleItems.reduce((sum, item) => sum + item.total, 0)
  );
  const amountPaid = roundAmount(payload.amountPaid ?? subtotal);
  const balanceDue = roundAmount(Math.max(0, subtotal - amountPaid));
  const paymentMethod = String(payload.paymentMethod || "cash").trim() || "cash";
  const saleId = options.saleId || createId();
  const saleReference =
    options.reference || buildReference("VTE", store.sales.length);
  const createdAt = options.createdAt || nowIso();
  const sale = normalizeSale({
    id: saleId,
    reference: saleReference,
    customerName: payload.customerName,
    paymentMethod,
    status: balanceDue > 0 ? "partial" : "paid",
    items: saleItems,
    subtotal,
    amountPaid,
    balanceDue,
    createdAt,
    updatedAt: nowIso()
  });

  const products = store.products.map(
    (product) => updatedProducts.get(product.id) || product
  );

  const stockMovements = saleItems
    .filter((item) => item.kind === "product")
    .map((item) =>
      normalizeMovement({
        productId: item.refId,
        type: "sale",
        quantityDelta: -item.quantity,
        note: `Vente ${sale.reference}`,
        referenceId: sale.id
      })
    );

  const cashEntries =
    amountPaid > 0
      ? [
          normalizeCashEntry({
            type: "sale",
            direction: "in",
            amount: amountPaid,
            paymentMethod,
            label: `Encaissement ${sale.reference}`,
            referenceId: sale.id
          }),
          ...store.cashEntries
        ]
      : [...store.cashEntries];

  return {
    ...store,
    products,
    sales: [sale, ...store.sales],
    stockMovements: [...stockMovements, ...store.stockMovements],
    cashEntries
  };
}

function createSale(store, payload = {}) {
  const updatedStore = commitSale(store, payload);
  const sale = updatedStore.sales[0];

  return {
    ...updatedStore,
    activityLog: addActivity(
      updatedStore,
      "sale_created",
      sale.reference,
      `${sale.items.length} ligne(s), total ${sale.subtotal}.`
    )
  };
}

function createExpense(store, payload = {}) {
  const label = String(payload.label || payload.note || "").trim();
  const amount = roundAmount(payload.amount);
  const paymentMethod = String(payload.paymentMethod || "cash").trim() || "cash";
  const note = String(payload.note || "").trim();

  if (!label) {
    throw new Error("Le libelle de la depense est obligatoire.");
  }

  if (amount <= 0) {
    throw new Error("Le montant de la depense doit etre positif.");
  }

  const cashEntry = normalizeCashEntry({
    type: "expense",
    direction: "out",
    amount,
    paymentMethod,
    label,
    referenceId: null
  });

  return {
    ...store,
    cashEntries: [cashEntry, ...store.cashEntries],
    activityLog: addActivity(
      store,
      "expense_created",
      label,
      note ? `${amount} depense(s) • ${note}` : `${amount} depense(s).`
    )
  };
}

function rollbackSaleEffects(store, sale) {
  const products = store.products.map((product) => {
    const restoredQuantity = sale.items
      .filter((item) => item.kind === "product" && item.refId === product.id)
      .reduce((sum, item) => sum + item.quantity, 0);

    if (!restoredQuantity) {
      return product;
    }

    return {
      ...product,
      stockOnHand: roundAmount(product.stockOnHand + restoredQuantity),
      updatedAt: nowIso()
    };
  });

  return {
    ...store,
    products,
    sales: store.sales.filter((entry) => entry.id !== sale.id),
    stockMovements: store.stockMovements.filter(
      (movement) => movement.referenceId !== sale.id
    ),
    cashEntries: store.cashEntries.filter((entry) => entry.referenceId !== sale.id)
  };
}

function updateSale(store, saleId, payload = {}) {
  const sale = store.sales.find((entry) => entry.id === saleId);

  if (!sale) {
    throw new Error("Vente introuvable.");
  }

  const rolledBackStore = rollbackSaleEffects(store, sale);
  const updatedStore = commitSale(rolledBackStore, payload, {
    saleId: sale.id,
    reference: sale.reference,
    createdAt: sale.createdAt
  });
  const refreshedSale = updatedStore.sales[0];

  return {
    ...updatedStore,
    activityLog: addActivity(
      updatedStore,
      "sale_updated",
      refreshedSale.reference,
      `${refreshedSale.items.length} ligne(s), total ${refreshedSale.subtotal}.`
    )
  };
}

function deleteSale(store, saleId) {
  const sale = store.sales.find((entry) => entry.id === saleId);

  if (!sale) {
    throw new Error("Vente introuvable.");
  }

  const updatedStore = rollbackSaleEffects(store, sale);

  return {
    ...updatedStore,
    activityLog: addActivity(
      updatedStore,
      "sale_deleted",
      sale.reference,
      "Vente supprimee."
    )
  };
}

function buildOverview(store) {
  const totalProducts = store.products.length;
  const totalServices = store.services.length;
  const stockValue = roundAmount(
    store.products.reduce(
      (sum, product) => sum + product.stockOnHand * product.costPrice,
      0
    )
  );
  const projectedRevenue = roundAmount(
    store.products.reduce(
      (sum, product) => sum + product.stockOnHand * product.salePrice,
      0
    )
  );
  const lowStockProducts = store.products.filter(
    (product) => product.stockOnHand <= product.reorderLevel
  );
  const totalSalesAmount = roundAmount(
    store.sales.reduce((sum, sale) => sum + sale.subtotal, 0)
  );
  const cashBalance = roundAmount(
    store.cashEntries.reduce(
      (sum, entry) => sum + (entry.direction === "in" ? entry.amount : -entry.amount),
      0
    )
  );

  return {
    totalProducts,
    totalServices,
    stockValue,
    projectedRevenue,
    lowStockCount: lowStockProducts.length,
    totalSales: store.sales.length,
    totalSalesAmount,
    cashBalance
  };
}

function buildBootstrap(store) {
  return {
    meta: store.meta,
    settings: store.settings,
    catalog: store.catalog,
    overview: buildOverview(store),
    products: store.products,
    services: store.services,
    sales: [...store.sales],
    stockMovements: [...store.stockMovements],
    cashEntries: [...store.cashEntries],
    activityLog: [...store.activityLog]
  };
}

function buildSellerBootstrap(store) {
  return {
    meta: store.meta,
    settings: store.settings,
    catalog: {
      paymentMethods: store.catalog.paymentMethods
    },
    products: store.products.filter((product) => product.isActive !== false),
    services: store.services.filter((service) => service.isActive !== false),
    sales: [...store.sales],
    cashEntries: [...store.cashEntries]
  };
}

module.exports = {
  STORE_VERSION,
  createDefaultStore,
  normalizeStore,
  addProduct,
  addService,
  receiveStock,
  createSale,
  createExpense,
  updateSale,
  deleteSale,
  buildBootstrap,
  buildSellerBootstrap
};
