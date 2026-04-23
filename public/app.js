const state = {
  auth: {
    authenticated: false,
    role: "seller"
  },
  meta: null,
  settings: {},
  catalog: {},
  overview: {},
  products: [],
  services: [],
  sales: [],
  stockMovements: [],
  cashEntries: [],
  activityLog: []
};

const page = document.body.dataset.page;
const pageRole = document.body.dataset.role || "public";
const listTemplate = document.querySelector("#list-item-template");
const statTemplate = document.querySelector("#stat-card-template");
const dbStatus = document.querySelector("#db-status");
const dbMeta = document.querySelector("#db-meta");
const assistantHistory = [];
let saleEditingId = null;
const treasuryState = {
  view: "week",
  selectedDate: new Date()
};
const productCategoryLabels = {
  envelope: "ENV (Enveloppe)",
  folder: "DOS (Chemise)",
  office_paper: "PAP (Papier bureau)",
  special_paper: "BRISTOL (Papier bristol)",
  photo_paper: "PHOTO (Papier photo)",
  colored_office_paper: "COLOR (Papier couleur)",
  plastic_sleeve: "POCH (Pochette)",
  spiral_binding: "SPI (Spirales)",
  book_cover_film: "COUV (Couverture livre)",
  lamination_film: "PLAST (Plastification)",
  staple: "AGRA (Agrafe)",
  notepad: "BLOCNOTE (Bloc-note)",
  supplies: "FOURNITURE SCOLAIRE"
};

function $(selector) {
  return document.querySelector(selector);
}

function formatCurrency(value) {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: state.settings.currency || "MGA",
    maximumFractionDigits: 0
  }).format(Number(value || 0));
}

function formatDate(value) {
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(new Date(value));
}

function formatProductCategory(value) {
  return productCategoryLabels[value] || value || "FOURNITURE SCOLAIRE";
}

function formatSupplier(value) {
  return String(value || "").trim() || "Fournisseur non renseigne";
}

function sameLocalDay(value) {
  const current = new Date();
  const target = new Date(value);
  return current.toDateString() === target.toDateString();
}

function startOfLocalDay(value) {
  const date = new Date(value);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(value, days) {
  const date = startOfLocalDay(value);
  date.setDate(date.getDate() + days);
  return date;
}

function addMonths(value, months) {
  const date = startOfLocalDay(value);
  date.setMonth(date.getMonth() + months);
  return date;
}

function endOfMonth(value) {
  const date = new Date(value);
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

function getMonthWeekPeriods(value) {
  const monthStart = new Date(value.getFullYear(), value.getMonth(), 1);
  const monthEnd = endOfMonth(monthStart);
  const periods = [];
  let periodStart = startOfLocalDay(monthStart);

  while (periodStart.getTime() <= monthEnd.getTime()) {
    const daysUntilSunday = (7 - periodStart.getDay()) % 7;
    const naturalPeriodEnd = addDays(periodStart, daysUntilSunday);
    const periodEnd =
      naturalPeriodEnd.getTime() > monthEnd.getTime() ? monthEnd : naturalPeriodEnd;

    periods.push({
      start: periodStart,
      end: periodEnd
    });

    periodStart = addDays(periodEnd, 1);
  }

  return periods;
}

function getMonthWeekPeriodForDate(value) {
  const target = startOfLocalDay(value);
  const periods = getMonthWeekPeriods(target);

  return (
    periods.find(
      (period) =>
        target.getTime() >= period.start.getTime() &&
        target.getTime() <= period.end.getTime()
    ) || periods[0]
  );
}

function formatDay(value) {
  return new Intl.DateTimeFormat("fr-FR", {
    weekday: "long",
    day: "2-digit",
    month: "short"
  }).format(value);
}

function formatPeriodMonth(value) {
  return new Intl.DateTimeFormat("fr-FR", {
    month: "long",
    year: "numeric"
  }).format(value);
}

function isBetweenDates(value, start, end) {
  const time = new Date(value).getTime();
  return time >= start.getTime() && time <= end.getTime();
}

function setStatus(message, isError = false) {
  if (!dbStatus) {
    return;
  }

  dbStatus.textContent = message;
  dbStatus.style.color = isError ? "var(--danger)" : "var(--accent)";
}

function redirectToAdminLogin() {
  const next = encodeURIComponent(window.location.pathname);
  window.location.href = `/admin-login.html?next=${next}`;
}

function syncState(payload) {
  Object.assign(state, payload);

  if (dbMeta) {
    dbMeta.textContent = `Modele v${state.meta?.version || "?"} • mise a jour ${formatDate(
      state.meta?.updatedAt || new Date().toISOString()
    )}`;
  }
}

function createListItem(title, subtitle, trailing) {
  const node = listTemplate.content.firstElementChild.cloneNode(true);
  node.querySelector("h3").textContent = title;
  node.querySelector("p").textContent = subtitle;
  node.querySelector("strong").textContent = trailing;
  return node;
}

function renderList(container, entries, mapper, emptyLabel) {
  if (!container) {
    return;
  }

  container.innerHTML = "";

  if (!entries.length) {
    const emptyState = document.createElement("div");
    emptyState.className = "empty-state";
    emptyState.textContent = emptyLabel;
    container.appendChild(emptyState);
    return;
  }

  entries.forEach((entry) => container.appendChild(mapper(entry)));
}

function fillSelect(select, entries, mapper) {
  if (!select) {
    return;
  }

  select.innerHTML = "";

  if (!entries.length) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "Aucune option disponible";
    select.appendChild(option);
    return;
  }

  entries.forEach((entry) => {
    const option = document.createElement("option");
    const mapped = mapper(entry);
    option.value = mapped.value;
    option.textContent = mapped.label;
    select.appendChild(option);
  });
}

async function requestJson(endpoint, options = {}) {
  const response = await fetch(endpoint, {
    method: options.method || "GET",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    },
    body: options.payload ? JSON.stringify(options.payload) : undefined
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    if (response.status === 401 && pageRole === "admin") {
      redirectToAdminLogin();
      return null;
    }

    throw new Error(data.error || "Operation impossible.");
  }

  return data;
}

function ensureAdminOnAdminPage() {
  if (pageRole === "admin" && !state.auth?.authenticated) {
    redirectToAdminLogin();
    return false;
  }

  return true;
}

async function loadData() {
  setStatus("Connexion locale");

  try {
    const payload = await requestJson("/api/bootstrap");
    if (!payload) {
      return;
    }

    syncState(payload);
    if (!ensureAdminOnAdminPage()) {
      return;
    }

    setupChrome();
    setStatus(
      state.auth?.authenticated ? "Session admin active" : "Espace vendeur ouvert"
    );
    renderPage();
  } catch (error) {
    setStatus(error.message, true);
  }
}

async function mutateData(endpoint, payload, method = "POST") {
  const data = await requestJson(endpoint, {
    method,
    payload
  });

  if (!data) {
    return;
  }

  syncState(data);
  if (!ensureAdminOnAdminPage()) {
    return;
  }

  setupChrome();
  renderPage();
}

function setupChrome() {
  document.querySelectorAll("[data-auth-role]").forEach((element) => {
    const expected = element.dataset.authRole;
    element.hidden = expected !== (state.auth?.authenticated ? "admin" : "seller");
  });

  document.querySelectorAll("[data-action='admin-logout']").forEach((button) => {
    if (button.dataset.bound) {
      return;
    }

    button.dataset.bound = "true";
    button.addEventListener("click", async () => {
      try {
        await requestJson("/api/auth/logout", { method: "POST", payload: {} });
        window.location.href = "/ventes.html";
      } catch (error) {
        setStatus(error.message, true);
      }
    });
  });
}

function renderStats() {
  const statsGrid = $("#stats-grid");
  if (!statsGrid || !statTemplate) {
    return;
  }

  const stats = [
    {
      label: "Produits",
      value: state.overview.totalProducts || 0,
      hint: `${state.overview.lowStockCount || 0} sous seuil`
    },
    {
      label: "Services",
      value: state.overview.totalServices || 0,
      hint: "Prestations disponibles"
    },
    {
      label: "Valeur du stock",
      value: formatCurrency(state.overview.stockValue || 0),
      hint: "Au cout d'achat"
    },
    {
      label: "Caisse",
      value: formatCurrency(state.overview.cashBalance || 0),
      hint: `${state.overview.totalSales || 0} vente(s)`
    }
  ];

  statsGrid.innerHTML = "";
  stats.forEach((stat) => {
    const node = statTemplate.content.firstElementChild.cloneNode(true);
    node.querySelector("span").textContent = stat.label;
    node.querySelector("strong").textContent = stat.value;
    node.querySelector("small").textContent = stat.hint;
    statsGrid.appendChild(node);
  });
}

function renderDashboard() {
  renderStats();

  const lowStockProducts = state.products.filter(
    (product) => product.stockOnHand <= product.reorderLevel
  );

  renderList(
    $("#low-stock-list"),
    lowStockProducts,
    (product) =>
      createListItem(
        product.name,
        `${formatProductCategory(product.category)} • ${formatSupplier(
          product.supplier
        )} • ${product.stockOnHand} ${product.unit} restant(s)`,
        `Seuil ${product.reorderLevel}`
      ),
    "Aucun produit sous seuil."
  );

  renderList(
    $("#sales-list"),
    state.sales,
    (sale) =>
      createListItem(
        sale.reference,
        `${sale.customerName} • ${sale.items.length} ligne(s) • ${formatDate(
          sale.createdAt
        )}`,
        formatCurrency(sale.subtotal)
      ),
    "Aucune vente enregistree."
  );

  renderList(
    $("#activity-list"),
    state.activityLog,
    (activity) =>
      createListItem(
        activity.label,
        `${activity.type} • ${formatDate(activity.createdAt)}`,
        activity.details || "-"
      ),
    "Aucune activite recente."
  );

  renderList(
    $("#stock-movements-list"),
    state.stockMovements,
    (movement) => {
      const product = state.products.find((entry) => entry.id === movement.productId);
      return createListItem(
        product?.name || "Produit supprime",
        `${movement.type} • ${movement.note || "Sans note"} • ${formatDate(
          movement.createdAt
        )}`,
        `${movement.quantityDelta > 0 ? "+" : ""}${movement.quantityDelta}`
      );
    },
    "Aucun mouvement de stock."
  );
}

function setupProductsPage() {
  const form = $("#product-form");
  const count = $("#products-count");

  if (count) {
    count.textContent = `${state.products.length} produit(s)`;
  }

  console.log('state.products', state.products)

  renderList(
    $("#products-list"),
    state.products,
    (product) =>
      createListItem(
        product.name,
        `${formatProductCategory(product.category)} • ${formatSupplier(
          product.supplier
        )} • ${product.stockOnHand} ${product.unit} • seuil ${product.reorderLevel}`,
        `${formatCurrency(product.salePrice)} • ${formatCurrency(product.costPrice)} • ${formatCurrency(product.purchaseTotalPrice)}`
      ),
    "Aucun produit pour le moment."
  );

  if (form && !form.dataset.bound) {
    form.dataset.bound = "true";
    form.addEventListener("submit", async (event) => {
      event.preventDefault();

      try {
        await mutateData("/api/products", Object.fromEntries(new FormData(form).entries()));
        form.reset();
        form.category.value = "";
        form.unit.value = "piece";
        form.salePrice.value = 0;
        form.costPrice.value = 0;
        form.purchaseTotalPrice.value = 0;
        form.reorderLevel.value = 5;
        setStatus("Produit ajoute");
      } catch (error) {
        setStatus(error.message, true);
      }
    });
  }
}

function setupStockPage() {
  const form = $("#stock-form");
  const select = $("#stock-product-id");

  fillSelect(select, state.products, (product) => ({
    value: product.id,
    label: `${product.name} (${product.stockOnHand} ${product.unit})`
  }));

  renderList(
    $("#stock-movements-list"),
    state.stockMovements,
    (movement) => {
      const product = state.products.find((entry) => entry.id === movement.productId);
      return createListItem(
        product?.name || "Produit supprime",
        `${movement.type} • ${movement.note || "Sans note"} • ${formatDate(
          movement.createdAt
        )}`,
        `${movement.quantityDelta > 0 ? "+" : ""}${movement.quantityDelta}`
      );
    },
    "Aucun mouvement de stock."
  );

  if (form && !form.dataset.bound) {
    form.dataset.bound = "true";
    form.addEventListener("submit", async (event) => {
      event.preventDefault();

      try {
        await mutateData(
          "/api/stock/receive",
          Object.fromEntries(new FormData(form).entries())
        );
        form.reset();
        form.quantity.value = 1;
        form.unitCost.value = 0;
        setStatus("Approvisionnement enregistre");
      } catch (error) {
        setStatus(error.message, true);
      }
    });
  }
}

function setupServicesPage() {
  const form = $("#service-form");
  const count = $("#services-count");

  if (count) {
    count.textContent = `${state.services.length} service(s)`;
  }

  renderList(
    $("#services-list"),
    state.services,
    (service) =>
      createListItem(
        service.name,
        `${service.category || "Divers"} • ${formatDate(
          service.updatedAt || service.createdAt
        )}`,
        formatCurrency(service.basePrice)
      ),
    "Aucun service pour le moment."
  );

  if (form && !form.dataset.bound) {
    form.dataset.bound = "true";
    form.addEventListener("submit", async (event) => {
      event.preventDefault();

      try {
        await mutateData("/api/services", Object.fromEntries(new FormData(form).entries()));
        form.reset();
        form.basePrice.value = 0;
        setStatus("Service ajoute");
      } catch (error) {
        setStatus(error.message, true);
      }
    });
  }
}

function getActiveEntryMode() {
  return (
    document.querySelector("[data-entry-mode].is-active")?.dataset.entryMode || "product"
  );
}

function getActiveHistoryMode() {
  return (
    document.querySelector("[data-history-mode].is-active")?.dataset.historyMode ||
    "product"
  );
}

function refreshPaymentMethodSelects() {
  const salePaymentMethodSelect = $("#payment-method");
  const expensePaymentMethodSelect = $("#expense-payment-method");

  fillSelect(salePaymentMethodSelect, state.catalog.paymentMethods || [], (entry) => ({
    value: entry,
    label: entry
  }));

  fillSelect(expensePaymentMethodSelect, state.catalog.paymentMethods || [], (entry) => ({
    value: entry,
    label: entry
  }));
}

function refreshSalesSelectors() {
  const mode = getActiveEntryMode();
  const refSelect = $("#sale-ref-id");
  const source = mode === "service" ? state.services : state.products;
  const refLabel = $("#sale-ref-label");

  fillSelect(refSelect, source, (entry) => ({
    value: entry.id,
    label:
      mode === "service"
        ? `${entry.name} (${formatCurrency(entry.basePrice)})`
        : `${entry.name} (${entry.stockOnHand} ${entry.unit})`
  }));

  if (refLabel) {
    refLabel.textContent = mode === "service" ? "Service" : "Produit";
  }
}

function setEntryMode(mode, preserveEditing = false) {
  const salePane = $("#sale-pane");
  const expensePane = $("#expense-pane");
  const title = $("#sale-form-title");
  const hint = $("#sale-editing-hint");
  const copy = $("#entry-panel-copy");
  const cancelEditButton = $("#sale-cancel-edit");

  document.querySelectorAll("[data-entry-mode]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.entryMode === mode);
    button.setAttribute(
      "aria-selected",
      button.dataset.entryMode === mode ? "true" : "false"
    );
  });

  if (mode === "expense") {
    if (!preserveEditing) {
      saleEditingId = null;
      if (cancelEditButton) {
        cancelEditButton.hidden = true;
      }
    }

    if (salePane) {
      salePane.hidden = true;
      salePane.classList.remove("is-active");
    }
    if (expensePane) {
      expensePane.hidden = false;
      expensePane.classList.add("is-active");
    }
    if (title) {
      title.textContent = "Nouvelle depense";
    }
    if (copy) {
      copy.textContent = "Rattache ici les depenses journalieres du vendeur.";
    }
    return;
  }

  if (salePane) {
    salePane.hidden = false;
    salePane.classList.add("is-active");
  }
  if (expensePane) {
    expensePane.hidden = true;
    expensePane.classList.remove("is-active");
  }

  refreshSalesSelectors();

  if (title) {
    if (preserveEditing && saleEditingId) {
      title.textContent = `${mode === "service" ? "Modification vente service" : "Modification vente produit"}`;
    } else {
      title.textContent =
        mode === "service" ? "Nouvelle vente service" : "Nouvelle vente produit";
    }
  }

  if (copy) {
    copy.textContent =
      mode === "service"
        ? "Utilise ce mode pour les prestations du multiservice."
        : "Utilise ce mode pour les articles physiques en stock.";
  }

  if (hint && !preserveEditing) {
    hint.textContent =
      mode === "service"
        ? "Le vendeur peut saisir librement une vente service sans mot de passe."
        : "Le vendeur peut saisir librement une vente produit sans mot de passe.";
  }
}

function clearSaleEditing(form) {
  saleEditingId = null;
  if (!form) {
    return;
  }

  form.reset();
  form.quantity.value = 1;
  form.amountPaid.value = 0;
  $("#sale-submit-label").textContent = "Valider la vente";
  $("#sale-cancel-edit").hidden = true;
  setEntryMode("product");
}

function populateSaleForm(sale) {
  const form = $("#sale-form");
  const item = sale.items[0];

  if (!form || !item) {
    return;
  }

  saleEditingId = sale.id;
  form.customerName.value = sale.customerName || "";
  form.quantity.value = item.quantity || 1;
  setEntryMode(item.kind, true);
  form.paymentMethod.value = sale.paymentMethod || "cash";
  form.amountPaid.value = sale.amountPaid || 0;
  form.refId.value = item.refId;
  $("#sale-submit-label").textContent = "Mettre a jour";
  $("#sale-form-title").textContent = `Modification ${sale.reference}`;
  $("#sale-editing-hint").textContent =
    "La mise a jour recalcule le stock et l'encaissement associes.";
  $("#sale-cancel-edit").hidden = false;
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function createSaleCard(sale) {
  const article = document.createElement("article");
  article.className = "sale-card";

  const item = sale.items[0];
  const badge = sameLocalDay(sale.createdAt) ? "Aujourd'hui" : "Anterieur";

  article.innerHTML = `
    <div class="sale-card-head">
      <div>
        <strong>${sale.reference}</strong>
        <p>${sale.customerName} • ${formatDate(sale.createdAt)}</p>
      </div>
      <span class="sale-badge">${badge}</span>
    </div>
    <div class="sale-card-body">
      <p>${item?.label || "Ligne"} • ${item?.quantity || 0} ${item?.unit || ""}</p>
      <p>Paiement ${sale.paymentMethod} • encaisse ${formatCurrency(
        sale.amountPaid
      )} • reste ${formatCurrency(sale.balanceDue)}</p>
    </div>
    <div class="sale-card-foot">
      <strong>${formatCurrency(sale.subtotal)}</strong>
      <div class="sale-actions">
        <button type="button" class="secondary-button" data-action="edit-sale">Modifier</button>
        <button type="button" class="danger-button" data-action="delete-sale">Supprimer</button>
      </div>
    </div>
  `;

  const editButton = article.querySelector("[data-action='edit-sale']");
  const deleteButton = article.querySelector("[data-action='delete-sale']");

  if (editButton) {
    editButton.addEventListener("click", () => {
      populateSaleForm(sale);
    });
  }

  if (deleteButton) {
    deleteButton.addEventListener("click", async () => {
      const confirmed = window.confirm(`Supprimer la vente ${sale.reference} ?`);
      if (!confirmed) {
        return;
      }

      try {
        await mutateData(`/api/sales/${sale.id}`, null, "DELETE");
        if (saleEditingId === sale.id) {
          clearSaleEditing($("#sale-form"));
        }
        setStatus("Vente supprimee");
      } catch (error) {
        setStatus(error.message, true);
      }
    });
  }

  return article;
}

function createExpenseCard(entry) {
  const article = document.createElement("article");
  article.className = "sale-card";

  const badge = sameLocalDay(entry.createdAt) ? "Aujourd'hui" : "Anterieur";
  article.innerHTML = `
    <div class="sale-card-head">
      <div>
        <strong>${entry.label}</strong>
        <p>${entry.paymentMethod} • ${formatDate(entry.createdAt)}</p>
      </div>
      <span class="sale-badge">${badge}</span>
    </div>
    <div class="sale-card-body">
      <p>Depense journaliere rattachee a la caisse</p>
    </div>
    <div class="sale-card-foot">
      <strong>-${formatCurrency(entry.amount)}</strong>
    </div>
  `;

  return article;
}

function renderSalesByFilter() {
  const list = $("#sales-list");
  const historyMode = getActiveHistoryMode();
  const filter = document.querySelector("[data-sales-filter].is-active")?.dataset
    .salesFilter;
  const mode = filter || "today";
  const counter = $("#sales-counter");
  const title = $("#history-title");

  let entries = [];
  let emptyLabel = "Aucun element.";

  if (historyMode === "expense") {
    const expenses = [...(state.cashEntries || [])]
      .filter((entry) => entry.type === "expense")
      .sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt));
    entries = expenses.filter((entry) =>
      mode === "older" ? !sameLocalDay(entry.createdAt) : sameLocalDay(entry.createdAt)
    );
    emptyLabel =
      mode === "older"
        ? "Aucune depense anterieure pour le moment."
        : "Aucune depense aujourd'hui pour le moment.";
    if (title) {
      title.textContent = "Depenses journalieres";
    }
  } else {
    const sales = [...state.sales]
      .filter((sale) => sale.items[0]?.kind === historyMode)
      .sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt));
    entries = sales.filter((sale) =>
      mode === "older" ? !sameLocalDay(sale.createdAt) : sameLocalDay(sale.createdAt)
    );
    emptyLabel =
      historyMode === "service"
        ? mode === "older"
          ? "Aucune vente service anterieure pour le moment."
          : "Aucune vente service aujourd'hui pour le moment."
        : mode === "older"
          ? "Aucune vente produit anterieure pour le moment."
          : "Aucune vente produit aujourd'hui pour le moment.";
    if (title) {
      title.textContent =
        historyMode === "service" ? "Ventes services" : "Ventes produits";
    }
  }

  if (counter) {
    counter.textContent = `${entries.length} element(s)`;
  }

  if (!list) {
    return;
  }

  list.innerHTML = "";

  if (!entries.length) {
    const emptyState = document.createElement("div");
    emptyState.className = "empty-state";
    emptyState.textContent = emptyLabel;
    list.appendChild(emptyState);
    return;
  }

  entries.forEach((entry) => {
    list.appendChild(
      historyMode === "expense" ? createExpenseCard(entry) : createSaleCard(entry)
    );
  });
}

function setupSalesPage() {
  const form = $("#sale-form");
  const expenseForm = $("#expense-form");
  const cancelEditButton = $("#sale-cancel-edit");

  refreshPaymentMethodSelects();
  refreshSalesSelectors();
  setEntryMode(getActiveEntryMode());
  renderSalesByFilter();

  document.querySelectorAll("[data-entry-mode]").forEach((button) => {
    if (button.dataset.bound) {
      return;
    }

    button.dataset.bound = "true";
    button.addEventListener("click", () => {
      if (saleEditingId && button.dataset.entryMode === "expense") {
        clearSaleEditing(form);
      }
      setEntryMode(button.dataset.entryMode || "product");
    });
  });

  document.querySelectorAll("[data-history-mode]").forEach((button) => {
    if (button.dataset.bound) {
      return;
    }

    button.dataset.bound = "true";
    button.addEventListener("click", () => {
      document
        .querySelectorAll("[data-history-mode]")
        .forEach((entry) => entry.classList.remove("is-active"));
      button.classList.add("is-active");
      renderSalesByFilter();
    });
  });

  document.querySelectorAll("[data-sales-filter]").forEach((button) => {
    if (button.dataset.bound) {
      return;
    }

    button.dataset.bound = "true";
    button.addEventListener("click", () => {
      document
        .querySelectorAll("[data-sales-filter]")
        .forEach((entry) => entry.classList.remove("is-active"));
      button.classList.add("is-active");
      renderSalesByFilter();
    });
  });

  if (cancelEditButton && !cancelEditButton.dataset.bound) {
    cancelEditButton.dataset.bound = "true";
    cancelEditButton.addEventListener("click", () => clearSaleEditing(form));
  }

  if (form && !form.dataset.bound) {
    form.dataset.bound = "true";
    form.addEventListener("submit", async (event) => {
      event.preventDefault();

      try {
        const values = Object.fromEntries(new FormData(form).entries());
        const quantity = Number(values.quantity || 0);
        const entryMode = getActiveEntryMode();
        const payload = {
          customerName: values.customerName,
          paymentMethod: values.paymentMethod,
          amountPaid: Number(values.amountPaid || 0),
          items: [
            entryMode === "service"
              ? { kind: "service", serviceId: values.refId, quantity }
              : { kind: "product", productId: values.refId, quantity }
          ]
        };

        if (saleEditingId) {
          await mutateData(`/api/sales/${saleEditingId}`, payload, "PUT");
          setStatus("Vente mise a jour");
        } else {
          await mutateData("/api/sales", payload);
          setStatus("Vente enregistree");
        }

        clearSaleEditing(form);
      } catch (error) {
        setStatus(error.message, true);
      }
    });
  }

  if (expenseForm && !expenseForm.dataset.bound) {
    expenseForm.dataset.bound = "true";
    expenseForm.addEventListener("submit", async (event) => {
      event.preventDefault();

      try {
        await mutateData(
          "/api/expenses",
          Object.fromEntries(new FormData(expenseForm).entries())
        );
        expenseForm.reset();
        expenseForm.amount.value = 0;
        setStatus("Depense enregistree");
      } catch (error) {
        setStatus(error.message, true);
      }
    });
  }
}

function setupActivityPage() {
  renderList(
    $("#activity-list"),
    state.activityLog,
    (activity) =>
      createListItem(
        activity.label,
        `${activity.type} • ${formatDate(activity.createdAt)}`,
        activity.details || "-"
      ),
    "Aucune activite recente."
  );

  renderList(
    $("#cash-list"),
    state.cashEntries,
    (entry) =>
      createListItem(
        entry.label,
        `${entry.type} • ${entry.paymentMethod} • ${formatDate(entry.createdAt)}`,
        `${entry.direction === "out" ? "-" : "+"}${formatCurrency(entry.amount)}`
      ),
    "Aucun mouvement de caisse."
  );
}

function getTreasuryPeriod() {
  const selectedMonthStart = new Date(
    treasuryState.selectedDate.getFullYear(),
    treasuryState.selectedDate.getMonth(),
    1
  );
  const selectedMonthEnd = endOfMonth(selectedMonthStart);

  if (treasuryState.view === "month") {
    const monthStart = selectedMonthStart;
    const monthEnd = selectedMonthEnd;
    monthEnd.setHours(23, 59, 59, 999);

    return {
      start: monthStart,
      end: monthEnd,
      label: formatPeriodMonth(monthStart)
    };
  }

  const selectedWeek = getMonthWeekPeriodForDate(treasuryState.selectedDate);
  const weekStart = selectedWeek.start;
  const weekEnd = new Date(selectedWeek.end);
  weekEnd.setHours(23, 59, 59, 999);

  return {
    start: weekStart,
    end: weekEnd,
    label: `${formatDay(weekStart)} - ${formatDay(weekEnd)}`
  };
}

function moveTreasuryPeriod(direction) {
  if (treasuryState.view === "month") {
    treasuryState.selectedDate = addMonths(treasuryState.selectedDate, direction);
    return;
  }

  const periods = getMonthWeekPeriods(treasuryState.selectedDate);
  const currentPeriod = getMonthWeekPeriodForDate(treasuryState.selectedDate);
  const currentIndex = periods.findIndex(
    (period) => period.start.getTime() === currentPeriod.start.getTime()
  );
  const nextIndex = Math.min(
    Math.max(currentIndex + direction, 0),
    periods.length - 1
  );

  treasuryState.selectedDate = periods[nextIndex].start;
}

function getSaleMargin(sale) {
  return roundClientAmount(
    (sale.items || []).reduce(
      (sum, item) =>
        sum + Number(item.total || 0) - Number(item.costPriceSnapshot || 0) * Number(item.quantity || 0),
      0
    )
  );
}

function roundClientAmount(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? Math.round(number * 100) / 100 : 0;
}

function getCashEntrySignedAmount(entry) {
  return entry.direction === "out" ? -Number(entry.amount || 0) : Number(entry.amount || 0);
}

function getTreasuryTotals(start, end) {
  const periodSales = (state.sales || []).filter((sale) =>
    isBetweenDates(sale.createdAt, start, end)
  );
  const periodCashEntries = (state.cashEntries || []).filter((entry) =>
    isBetweenDates(entry.createdAt, start, end)
  );
  const currentExpenses = periodCashEntries.filter((entry) => entry.type === "expense");
  const reportBeforePeriod = roundClientAmount(
    (state.cashEntries || [])
      .filter((entry) => new Date(entry.createdAt).getTime() < start.getTime())
      .reduce((sum, entry) => sum + getCashEntrySignedAmount(entry), 0)
  );
  const periodCashFlow = roundClientAmount(
    periodCashEntries.reduce((sum, entry) => sum + getCashEntrySignedAmount(entry), 0)
  );
  const salesTotal = roundClientAmount(
    periodSales.reduce((sum, sale) => sum + Number(sale.subtotal || 0), 0)
  );
  const expensesTotal = roundClientAmount(
    currentExpenses.reduce((sum, entry) => sum + Number(entry.amount || 0), 0)
  );
  const stockPurchasesTotal = roundClientAmount(
    periodCashEntries
      .filter((entry) => entry.type === "stock_purchase")
      .reduce((sum, entry) => sum + Number(entry.amount || 0), 0)
  );
  const grossMargin = roundClientAmount(
    periodSales.reduce((sum, sale) => sum + getSaleMargin(sale), 0)
  );

  return {
    periodSales,
    periodCashEntries,
    reportBeforePeriod,
    salesTotal,
    expensesTotal,
    stockPurchasesTotal,
    grossMargin,
    netProfit: roundClientAmount(grossMargin - expensesTotal),
    endingBalance: roundClientAmount(reportBeforePeriod + periodCashFlow)
  };
}

function getTreasuryDayRows(start, end) {
  const rows = [];
  let report = roundClientAmount(
    (state.cashEntries || [])
      .filter((entry) => new Date(entry.createdAt).getTime() < start.getTime())
      .reduce((sum, entry) => sum + getCashEntrySignedAmount(entry), 0)
  );

  for (let day = startOfLocalDay(start); day.getTime() <= end.getTime(); day = addDays(day, 1)) {
    const dayEnd = addDays(day, 1);
    const sales = (state.sales || []).filter(
      (sale) =>
        new Date(sale.createdAt).getTime() >= day.getTime() &&
        new Date(sale.createdAt).getTime() < dayEnd.getTime()
    );
    const cashEntries = (state.cashEntries || []).filter(
      (entry) =>
        new Date(entry.createdAt).getTime() >= day.getTime() &&
        new Date(entry.createdAt).getTime() < dayEnd.getTime()
    );
    const salesTotal = roundClientAmount(
      sales.reduce((sum, sale) => sum + Number(sale.subtotal || 0), 0)
    );
    const expensesTotal = roundClientAmount(
      cashEntries
        .filter((entry) => entry.type === "expense")
        .reduce((sum, entry) => sum + Number(entry.amount || 0), 0)
    );
    const grossMargin = roundClientAmount(
      sales.reduce((sum, sale) => sum + getSaleMargin(sale), 0)
    );
    const cashFlow = roundClientAmount(
      cashEntries.reduce((sum, entry) => sum + getCashEntrySignedAmount(entry), 0)
    );
    const endingBalance = roundClientAmount(report + cashFlow);

    rows.push({
      date: day,
      report,
      salesTotal,
      expensesTotal,
      grossMargin,
      endingBalance
    });
    report = endingBalance;
  }

  return rows;
}

function getTreasuryWeekRows(start, end) {
  const rows = [];
  let report = roundClientAmount(
    (state.cashEntries || [])
      .filter((entry) => new Date(entry.createdAt).getTime() < start.getTime())
      .reduce((sum, entry) => sum + getCashEntrySignedAmount(entry), 0)
  );
  let weekNumber = 1;

  getMonthWeekPeriods(start).forEach((period) => {
    const weekStart = period.start;
    const weekEnd = addDays(period.end, 1);
    const sales = (state.sales || []).filter(
      (sale) =>
        new Date(sale.createdAt).getTime() >= weekStart.getTime() &&
        new Date(sale.createdAt).getTime() < weekEnd.getTime()
    );
    const cashEntries = (state.cashEntries || []).filter(
      (entry) =>
        new Date(entry.createdAt).getTime() >= weekStart.getTime() &&
        new Date(entry.createdAt).getTime() < weekEnd.getTime()
    );
    const salesTotal = roundClientAmount(
      sales.reduce((sum, sale) => sum + Number(sale.subtotal || 0), 0)
    );
    const expensesTotal = roundClientAmount(
      cashEntries
        .filter((entry) => entry.type === "expense")
        .reduce((sum, entry) => sum + Number(entry.amount || 0), 0)
    );
    const grossMargin = roundClientAmount(
      sales.reduce((sum, sale) => sum + getSaleMargin(sale), 0)
    );
    const cashFlow = roundClientAmount(
      cashEntries.reduce((sum, entry) => sum + getCashEntrySignedAmount(entry), 0)
    );
    const endingBalance = roundClientAmount(report + cashFlow);

    rows.push({
      label: `Semaine ${String(weekNumber).padStart(2, "0")}`,
      detail: `${formatDay(weekStart)} - ${formatDay(addDays(weekEnd, -1))}`,
      report,
      salesTotal,
      expensesTotal,
      grossMargin,
      endingBalance
    });
    report = endingBalance;
    weekNumber += 1;
  });

  return rows;
}

function getTreasuryRows(start, end) {
  if (treasuryState.view === "month") {
    return getTreasuryWeekRows(start, end);
  }

  return getTreasuryDayRows(start, end).map((row) => ({
    ...row,
    label: formatDay(row.date)
  }));
}

function renderTreasuryStats(totals) {
  const statsGrid = $("#treasury-stats");
  if (!statsGrid || !statTemplate) {
    return;
  }

  const stats = [
    {
      label: "Reporte avant periode",
      value: formatCurrency(totals.reportBeforePeriod),
      hint: "Solde de caisse precedent"
    },
    {
      label: "Total des ventes",
      value: formatCurrency(totals.salesTotal),
      hint: `${totals.periodSales.length} vente(s) produits et services`
    },
    {
      label: "Depenses courantes",
      value: formatCurrency(totals.expensesTotal),
      hint: "Hors approvisionnements stock"
    },
    {
      label: "Benefice net",
      value: formatCurrency(totals.netProfit),
      hint: "Marge brute moins depenses"
    },
    {
      label: "Solde fin periode",
      value: formatCurrency(totals.endingBalance),
      hint: `Achats stock: ${formatCurrency(totals.stockPurchasesTotal)}`
    }
  ];

  statsGrid.innerHTML = "";
  stats.forEach((stat) => {
    const node = statTemplate.content.firstElementChild.cloneNode(true);
    node.querySelector("span").textContent = stat.label;
    node.querySelector("strong").textContent = stat.value;
    node.querySelector("small").textContent = stat.hint;
    statsGrid.appendChild(node);
  });
}

function renderTreasuryRows(rows) {
  const body = $("#treasury-days-body");
  const count = $("#treasury-days-count");

  if (count) {
    count.textContent =
      treasuryState.view === "month"
        ? `${rows.length} semaine(s)`
        : `${rows.length} jour(s)`;
  }

  if (!body) {
    return;
  }

  body.innerHTML = "";
  rows.forEach((row) => {
    const tr = document.createElement("tr");
    [
      row.detail ? `${row.label} • ${row.detail}` : row.label,
      formatCurrency(row.report),
      formatCurrency(row.salesTotal),
      `-${formatCurrency(row.expensesTotal)}`,
      formatCurrency(row.grossMargin),
      formatCurrency(row.endingBalance)
    ].forEach((value, index) => {
      const cell = document.createElement(index === 0 ? "th" : "td");
      cell.textContent = value;
      if (index === 2 || index === 4) {
        cell.className = "amount-positive";
      }
      if (index === 3) {
        cell.className = "amount-negative";
      }
      tr.appendChild(cell);
    });
    body.appendChild(tr);
  });
}

function renderTreasuryLists(totals) {
  const sortedMovements = [...totals.periodCashEntries].sort(
    (left, right) => new Date(right.createdAt) - new Date(left.createdAt)
  );
  const sortedSales = [...totals.periodSales].sort(
    (left, right) => new Date(right.createdAt) - new Date(left.createdAt)
  );

  const movementsCount = $("#treasury-movements-count");
  const salesCount = $("#treasury-sales-count");
  if (movementsCount) {
    movementsCount.textContent = `${sortedMovements.length} mouvement(s)`;
  }
  if (salesCount) {
    salesCount.textContent = `${sortedSales.length} vente(s)`;
  }

  renderList(
    $("#treasury-movements-list"),
    sortedMovements,
    (entry) =>
      createListItem(
        entry.label || entry.type,
        `${entry.type} • ${entry.paymentMethod} • ${formatDate(entry.createdAt)}`,
        `${entry.direction === "out" ? "-" : "+"}${formatCurrency(entry.amount)}`
      ),
    "Aucun mouvement sur cette periode."
  );

  renderList(
    $("#treasury-sales-list"),
    sortedSales,
    (sale) =>
      createListItem(
        sale.reference,
        `${sale.customerName} • ${sale.items.length} ligne(s) • marge ${formatCurrency(
          getSaleMargin(sale)
        )}`,
        formatCurrency(sale.subtotal)
      ),
    "Aucune vente sur cette periode."
  );
}

function renderTreasuryPage() {
  const period = getTreasuryPeriod();
  const totals = getTreasuryTotals(period.start, period.end);
  const rows = getTreasuryRows(period.start, period.end);
  const periodLabel = $("#treasury-period-label");
  const daysTitle = $("#treasury-days-title");
  const daysCopy = $("#treasury-days-copy");
  const firstColumn = $("#treasury-period-column");
  const prevButton = $("[data-treasury-month='prev']");
  const nextButton = $("[data-treasury-month='next']");
  const monthWeekPeriods = getMonthWeekPeriods(treasuryState.selectedDate);
  const currentMonthWeek = getMonthWeekPeriodForDate(treasuryState.selectedDate);
  const currentMonthWeekIndex = monthWeekPeriods.findIndex(
    (entry) => entry.start.getTime() === currentMonthWeek.start.getTime()
  );

  if (periodLabel) {
    periodLabel.textContent = period.label;
  }
  if (daysTitle) {
    daysTitle.textContent =
      treasuryState.view === "month" ? "Semaines du mois" : "Jours de la semaine";
  }
  if (daysCopy) {
    daysCopy.textContent =
      treasuryState.view === "month"
        ? "Chaque ligne regroupe les mouvements d'une semaine du mois selectionne."
        : "Les depenses courantes sont retirees du solde journalier.";
  }
  if (firstColumn) {
    firstColumn.textContent = treasuryState.view === "month" ? "Semaine" : "Jour";
  }
  if (prevButton) {
    prevButton.setAttribute(
      "aria-label",
      treasuryState.view === "month" ? "Mois precedent" : "Semaine precedente"
    );
    prevButton.setAttribute(
      "title",
      treasuryState.view === "month" ? "Mois precedent" : "Semaine precedente"
    );
    prevButton.disabled =
      treasuryState.view === "week" && currentMonthWeekIndex <= 0;
  }
  if (nextButton) {
    nextButton.setAttribute(
      "aria-label",
      treasuryState.view === "month" ? "Mois suivant" : "Semaine suivante"
    );
    nextButton.setAttribute(
      "title",
      treasuryState.view === "month" ? "Mois suivant" : "Semaine suivante"
    );
    nextButton.disabled =
      treasuryState.view === "week" &&
      currentMonthWeekIndex >= monthWeekPeriods.length - 1;
  }

  document.querySelectorAll("[data-treasury-view]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.treasuryView === treasuryState.view);
    button.setAttribute(
      "aria-selected",
      button.dataset.treasuryView === treasuryState.view ? "true" : "false"
    );
  });

  renderTreasuryStats(totals);
  renderTreasuryRows(rows);
  renderTreasuryLists(totals);
}

function setupTreasuryPage() {
  document.querySelectorAll("[data-treasury-view]").forEach((button) => {
    if (button.dataset.bound) {
      return;
    }

    button.dataset.bound = "true";
    button.addEventListener("click", () => {
      treasuryState.view = button.dataset.treasuryView || "week";
      renderTreasuryPage();
    });
  });

  document.querySelectorAll("[data-treasury-month]").forEach((button) => {
    if (button.dataset.bound) {
      return;
    }

    button.dataset.bound = "true";
    button.addEventListener("click", () => {
      moveTreasuryPeriod(button.dataset.treasuryMonth === "prev" ? -1 : 1);
      renderTreasuryPage();
    });
  });

  renderTreasuryPage();
}

function appendAssistantMessage(role, text) {
  const thread = $("#assistant-messages");
  const template = $("#assistant-message-template");

  if (!thread || !template) {
    return;
  }

  const node = template.content.firstElementChild.cloneNode(true);
  node.classList.add(role);
  node.querySelector(".assistant-role").textContent =
    role === "user" ? "Question" : "Assistant";
  node.querySelector(".assistant-body").textContent = text;
  thread.appendChild(node);
}

function renderAssistantHistory() {
  const thread = $("#assistant-messages");
  if (!thread) {
    return;
  }

  thread.innerHTML = "";

  if (!assistantHistory.length) {
    appendAssistantMessage(
      "assistant",
      "Je peux analyser la marge mensuelle, la valeur de vente theorique du stock et le produit le plus vendu sur un mois."
    );
    return;
  }

  assistantHistory.forEach((entry) => {
    appendAssistantMessage(entry.role, entry.text);
  });
}

async function askAssistant(question) {
  return requestJson("/api/assistant/query", {
    method: "POST",
    payload: { question }
  });
}

function setupAssistantPage() {
  const form = $("#assistant-form");
  const input = $("#assistant-question");
  const suggestionButtons = document.querySelectorAll(".suggestion-chip");

  renderAssistantHistory();

  suggestionButtons.forEach((button) => {
    if (button.dataset.bound) {
      return;
    }

    button.dataset.bound = "true";
    button.addEventListener("click", () => {
      if (input) {
        input.value = button.dataset.question || "";
        input.focus();
      }
    });
  });

  if (form && !form.dataset.bound) {
    form.dataset.bound = "true";
    form.addEventListener("submit", async (event) => {
      event.preventDefault();

      try {
        const question = String(input?.value || "").trim();
        if (!question) {
          return;
        }

        assistantHistory.push({
          role: "user",
          text: question
        });
        renderAssistantHistory();
        setStatus("Analyse de la question");

        const result = await askAssistant(question);
        assistantHistory.push({
          role: "assistant",
          text: result.answer
        });
        renderAssistantHistory();
        form.reset();
        setStatus("Reponse generee");
      } catch (error) {
        setStatus(error.message, true);
      }
    });
  }
}

async function setupLoginPage() {
  const form = $("#admin-login-form");
  const session = await requestJson("/api/auth/session");
  const next = new URLSearchParams(window.location.search).get("next") || "/index.html";

  if (session?.authenticated) {
    window.location.href = next;
    return;
  }

  if (form && !form.dataset.bound) {
    form.dataset.bound = "true";
    form.addEventListener("submit", async (event) => {
      event.preventDefault();

      try {
        const password = String($("#admin-password")?.value || "");
        await requestJson("/api/auth/login", {
          method: "POST",
          payload: { password }
        });
        window.location.href = next;
      } catch (error) {
        const errorNode = $("#login-error");
        if (errorNode) {
          errorNode.textContent = error.message;
        }
      }
    });
  }
}

function renderPage() {
  if (page === "dashboard") {
    renderDashboard();
    return;
  }

  if (page === "products") {
    setupProductsPage();
    return;
  }

  if (page === "stock") {
    setupStockPage();
    return;
  }

  if (page === "services") {
    setupServicesPage();
    return;
  }

  if (page === "sales") {
    setupSalesPage();
    return;
  }

  if (page === "activity") {
    setupActivityPage();
    return;
  }

  if (page === "treasury") {
    setupTreasuryPage();
    return;
  }

  if (page === "assistant") {
    setupAssistantPage();
  }
}

if (page === "login") {
  setupLoginPage();
} else {
  loadData();
}
