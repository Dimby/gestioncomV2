/**
 * Charge et insère un composant HTML réutilisable
 * @param {string} componentPath - Chemin relatif du composant
 * @param {string} selector - Sélecteur où insérer le composant
 */
async function loadComponent(componentPath, selector = "body") {
  try {
    const response = await fetch(componentPath);
    if (!response.ok) throw new Error(`Erreur ${response.status}: ${componentPath}`);
    
    const html = await response.text();
    const container = document.querySelector(selector);
    
    if (!container) {
      console.error(`Conteneur non trouvé: ${selector}`);
      return;
    }
    
    container.insertAdjacentHTML("afterbegin", html);
    console.log(`✅ Composant chargé: ${componentPath}`);
  } catch (error) {
    console.error(`❌ Erreur loading component:`, error);
  }
}

/**
 * Met à jour l'état actif du sidebar en fonction de la page
 */
function activateSidebarLink() {
  const currentPage = document.body.dataset.page;
  document.querySelectorAll(".nav-link[data-page]").forEach(link => {
    const isActive = link.dataset.page === currentPage;
    link.classList.toggle("is-active", isActive);
  });
}