async function initializePage() {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const selection = document.getElementById("selection");
    const shoppingGuide = document.getElementById("shopping-guide");
    const access = document.getElementById("access");
    const philosophy = document.querySelector(".philosophy-section");
    const freeScrollSections = [philosophy, selection, shoppingGuide];
    const scrollSections = [
      document.getElementById("story"),
      philosophy,
      selection,
      access,
      shoppingGuide,
      document.getElementById("contact")
    ];
    let wheelDelta = 0;
    let wheelResetTimer;
    let screenScrollTimer;
    let screenScrolling = false;
    let touchStart = { x: 0, y: 0 };
    let touchDelta = { x: 0, y: 0 };
    let touchPaging = false;

    function sectionTop(section) {
      return section.getBoundingClientRect().top + window.scrollY;
    }

    function canScrollNaturally(section) {
      return freeScrollSections.includes(section) || section.offsetHeight > window.innerHeight;
    }

    function isInsideFreeScrollSection(scrollPosition) {
      return scrollSections.some(section => {
        if (!canScrollNaturally(section)) return false;
        const start = sectionTop(section);
        return scrollPosition >= start - 2 && scrollPosition < start + section.offsetHeight - 2;
      });
    }

    function scrollOneScreen(direction) {
      if (screenScrolling) return;
      const currentScroll = window.scrollY;
      const stops = [0, ...scrollSections.map(sectionTop)];
      const destination = direction > 0
        ? stops.find(stop => stop > currentScroll + 2)
        : stops.filter(stop => stop < currentScroll - 2).at(-1);
      if (destination === undefined) return;
      if (Math.abs(destination - currentScroll) < 2) return;

      screenScrolling = true;
      window.scrollTo({ top: destination, behavior: reducedMotion.matches ? "auto" : "smooth" });
      window.clearTimeout(screenScrollTimer);
      screenScrollTimer = window.setTimeout(() => { screenScrolling = false; }, reducedMotion.matches ? 0 : 650);
    }

    document.addEventListener("wheel", event => {
      if (reducedMotion.matches || Math.abs(event.deltaY) < Math.abs(event.deltaX)) return;

      const currentScroll = window.scrollY;
      const freeSection = scrollSections.find(section => {
        if (!canScrollNaturally(section)) return false;
        const start = sectionTop(section);
        return currentScroll >= start - 2 && currentScroll < start + section.offsetHeight - 2;
      });
      const freeSectionStart = freeSection ? sectionTop(freeSection) : 0;
      const freeSectionEnd = freeSectionStart + (freeSection?.offsetHeight || 0);
      const leavingFreeSection = freeSection && (
        (event.deltaY < 0 && currentScroll <= freeSectionStart + 2) ||
        (event.deltaY > 0 && currentScroll + window.innerHeight >= freeSectionEnd - 2)
      );
      if (freeSection && !leavingFreeSection) return;

      event.preventDefault();
      if (screenScrolling) return;

      wheelDelta += event.deltaMode === 1 ? event.deltaY * 16 : event.deltaMode === 2 ? event.deltaY * window.innerHeight : event.deltaY;
      window.clearTimeout(wheelResetTimer);
      wheelResetTimer = window.setTimeout(() => { wheelDelta = 0; }, 300);

      const threshold = Math.max(120, window.innerHeight * .12);
      if (Math.abs(wheelDelta) < threshold) return;

      const direction = Math.sign(wheelDelta);
      wheelDelta = 0;
      scrollOneScreen(direction);
    }, { passive: false });

    document.addEventListener("touchstart", event => {
      if (!event.touches.length) return;
      touchStart = { x: event.touches[0].clientX, y: event.touches[0].clientY };
      touchDelta = { x: 0, y: 0 };
      touchPaging = !reducedMotion.matches && !isInsideFreeScrollSection(window.scrollY);
    }, { passive: true });

    document.addEventListener("touchmove", event => {
      if (!touchPaging || !event.touches.length) return;
      touchDelta = {
        x: touchStart.x - event.touches[0].clientX,
        y: touchStart.y - event.touches[0].clientY
      };
      if (Math.abs(touchDelta.y) > Math.abs(touchDelta.x)) event.preventDefault();
    }, { passive: false });

    document.addEventListener("touchend", () => {
      if (touchPaging && Math.abs(touchDelta.y) >= 36 && Math.abs(touchDelta.y) > Math.abs(touchDelta.x)) {
        scrollOneScreen(Math.sign(touchDelta.y));
      }
      touchPaging = false;
      touchDelta = { x: 0, y: 0 };
    }, { passive: true });

    const response = await fetch("data/catalog.json");
    if (!response.ok) throw new Error("Catalog data could not be loaded.");
    const catalog = await response.json();
    const producerData = catalog.producers;
    const priceData = catalog.prices;

    const tabs = document.getElementById("brewery-tabs");
    const panel = document.getElementById("brewery-panel");

    function createElement(tagName, className, text) {
      const element = document.createElement(tagName);
      if (className) element.className = className;
      if (text !== undefined) element.textContent = String(text);
      return element;
    }

    function safeUrl(value, allowLocalImage = false) {
      if (typeof value !== "string" || !value.trim()) return "";
      if (allowLocalImage && /^images\/[A-Za-z0-9._/-]+$/.test(value) && !value.split("/").includes("..")) {
        return value;
      }

      try {
        const url = new URL(value, window.location.href);
        if (url.username || url.password) return "";
        if (url.protocol === "https:" || url.protocol === "http:") return url.href;
      } catch (error) {
        console.warn("カタログ内のURLを無視しました。", error);
      }
      return "";
    }

    function createExternalLink(url, label, className) {
      const safeHref = safeUrl(url);
      if (!safeHref) return null;
      const link = createElement("a", className, label);
      link.href = safeHref;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      return link;
    }

    function productImageUrl(producer, item) {
      const explicitUrl = item.imageUrl || producer.imageUrl || item.imageSourceUrl;
      return safeUrl(explicitUrl, true);
    }

    function renderProducer(index) {
      const producer = producerData[index];
      tabs.querySelectorAll("[role=tab]").forEach((tab, tabIndex) => {
        const active = tabIndex === index;
        tab.setAttribute("aria-selected", String(active));
        tab.tabIndex = active ? 0 : -1;
      });
      panel.setAttribute("aria-labelledby", `brewery-tab-${index}`);
      panel.classList.remove("is-changing");
      const breweryHref = producer.breweryUrl;
      const breweryLinkText = producer.breweryUrl
        ? `${producer.maker} 公式サイトを見る`
        : `${producer.name}の商品・蔵元情報（藤田酒店掲載ページ）を見る`;
      const heading = createElement("div", "brewery-panel-heading");
      const titleGroup = createElement("div");
      titleGroup.append(
        createElement("span", "kicker", producer.category || "Sake brewery"),
        createElement("h3", "", producer.name)
      );
      heading.append(titleGroup, createElement("p", "", producer.maker));

      const gallery = createElement("div", "gallery-grid");
      producer.items.forEach(item => {
        const displayName = item.officialName || item.displayName || item.name;
        const category = producer.category || (item.type.includes("焼酎") ? "焼酎" : "日本酒");
        const producerPrices = priceData.producers[producer.id];
        const price = producerPrices?.[item.name] || producerPrices?.default;
        const article = createElement("article", "gallery-card");
        const imageContainer = createElement("div", "product-image");
        const imageUrl = productImageUrl(producer, item);
        if (imageUrl) {
          const image = createElement("img");
          image.src = imageUrl;
          image.alt = displayName;
          image.loading = "lazy";
          imageContainer.append(image);
        } else {
          imageContainer.append(createElement("span", "", producer.name));
        }
        article.append(imageContainer);

        const meta = createElement("div", "product-meta");
        if (category !== "日本酒") meta.append(createElement("span", "", category));
        meta.append(createElement("span", "", item.type));
        article.append(meta, createElement("h4", "", displayName));

        if (item.catchCopy) article.append(createElement("p", "product-catch", item.catchCopy));
        if (item.description) article.append(createElement("p", "", item.description));

        if (item.specs) {
          const specLabels = { designation: "特定名称", rice: "原料米", polishingRatio: "精米歩合", alcohol: "アルコール分" };
          const specs = createElement("dl", "product-specs");
          Object.entries(specLabels).forEach(([key, label]) => {
            if (!item.specs[key]) return;
            const value = key === "rice"
              ? `${item.specs[key]}（${item.specs.riceOrigin || "産地確認中"}）`
              : item.specs[key];
            specs.append(createElement("dt", "", label), createElement("dd", "", value));
          });
          article.append(specs);
        }

        if (item.ownerComment?.trim()) {
          const ownerComment = createElement("p", "owner-comment");
          ownerComment.append(createElement("strong", "", "店主から"), document.createElement("br"), document.createTextNode(item.ownerComment));
          article.append(ownerComment);
        }

        if (price) {
          const prices = createElement("dl", "product-prices");
          price.prices.forEach(entry => {
            const row = createElement("div");
            const amount = createElement("dd");
            amount.append(document.createTextNode(`¥${entry.amount.toLocaleString("ja-JP")}`), createElement("span", "", " (税込)"));
            row.append(createElement("dt", "", entry.volume), amount);
            prices.append(row);
          });
          article.append(prices, createElement("p", "price-label", price.label));
        }

        const sourceLink = createExternalLink(item.sourceUrl, "蔵元の公式ラインナップ ↗", "product-source");
        if (sourceLink) article.append(sourceLink);
        gallery.append(article);
      });

      const breweryMessage = createElement("div", "brewery-message");
      breweryMessage.append(
        createElement("h4", "", "蔵元の紹介"),
        createElement("p", "", producer.story)
      );
      const catalogSource = createElement("p", "catalog-source");
      const breweryLink = createExternalLink(breweryHref, `${breweryLinkText} ↗`);
      if (breweryLink) catalogSource.append(breweryLink);

      panel.replaceChildren(heading, gallery, breweryMessage, catalogSource);
      requestAnimationFrame(() => panel.classList.add("is-changing"));
    }

    producerData.forEach((producer, index) => {
      const tab = document.createElement("button");
      tab.className = "brewery-tab";
      tab.type = "button";
      tab.id = `brewery-tab-${index}`;
      tab.setAttribute("role", "tab");
      tab.setAttribute("aria-selected", String(index === 0));
      tab.setAttribute("aria-controls", "brewery-panel");
      tab.tabIndex = index === 0 ? 0 : -1;
      tab.textContent = producer.name;
      tab.addEventListener("click", () => renderProducer(index));
      tab.addEventListener("keydown", event => {
        const keyMoves = { ArrowRight: 1, ArrowLeft: -1, Home: "first", End: "last" };
        if (!(event.key in keyMoves)) return;
        event.preventDefault();
        const next = keyMoves[event.key] === "first" ? 0 : keyMoves[event.key] === "last" ? producerData.length - 1 : (index + keyMoves[event.key] + producerData.length) % producerData.length;
        tabs.children[next].focus();
        renderProducer(next);
      });
      tabs.append(tab);
    });
    renderProducer(0);

    }

    initializePage().catch(error => {
      console.error("藤田酒店サイトの初期化に失敗しました。", error);
      const errorMessage = document.createElement("p");
      errorMessage.textContent = "商品情報を読み込めませんでした。HTTPサーバー経由でページを開いてください。";
      document.getElementById("brewery-panel").replaceChildren(errorMessage);
    });
