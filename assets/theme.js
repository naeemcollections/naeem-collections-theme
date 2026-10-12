(function () {
  function money(cents) {
    var amount = Math.round(Number(cents) / 100);
    var formatted = String(amount).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    var currency = (window.NaeemTheme && window.NaeemTheme.currency) || "PKR";
    return currency === "PKR" ? "Rs. " + formatted : formatted + " " + currency;
  }

  function initHero(root) {
    var slides = Array.prototype.slice.call(root.querySelectorAll("[data-slide]"));
    if (!slides.length) return;
    var track = root.querySelector(".hero__track");
    var dots = Array.prototype.slice.call(root.querySelectorAll("[data-dot]"));
    var index = 0;
    var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    var design = window.Shopify && window.Shopify.designMode;
    var autoplay = root.getAttribute("data-autoplay") === "true" && !reduce && !design;
    var speed = (Number(root.getAttribute("data-speed")) || 6) * 1000;
    var timer = null;

    function go(next) {
      index = (next + slides.length) % slides.length;
      if (track) track.style.transform = "translateX(-" + index * 100 + "%)";
      slides.forEach(function (slide, i) {
        if (i === index) slide.removeAttribute("inert");
        else slide.setAttribute("inert", "");
      });
      dots.forEach(function (dot, i) {
        dot.setAttribute("aria-current", i === index ? "true" : "false");
      });
    }

    function start() {
      if (!autoplay) return;
      stop();
      timer = window.setInterval(function () {
        go(index + 1);
      }, speed);
    }

    function stop() {
      if (timer) window.clearInterval(timer);
    }

    var prev = root.querySelector("[data-prev]");
    var next = root.querySelector("[data-next]");
    if (prev) prev.addEventListener("click", function () { go(index - 1); });
    if (next) next.addEventListener("click", function () { go(index + 1); });
    dots.forEach(function (dot, i) {
      dot.addEventListener("click", function () { go(i); });
    });
    root.addEventListener("mouseenter", stop);
    root.addEventListener("mouseleave", start);
    var startX = null;
    root.addEventListener("pointerdown", function (event) { startX = event.clientX; });
    root.addEventListener("pointerup", function (event) {
      if (startX == null) return;
      var delta = event.clientX - startX;
      if (delta > 48) go(index - 1);
      if (delta < -48) go(index + 1);
      startX = null;
    });
    document.addEventListener("shopify:block:select", function (event) {
      var slide = event.target.closest("[data-slide]");
      if (!slide || !root.contains(slide)) return;
      stop();
      go(slides.indexOf(slide));
    });
    go(0);
    start();
  }

  function setCount(count) {
    document.querySelectorAll("[data-cart-count]").forEach(function (el) {
      el.textContent = String(count);
      el.hidden = count < 1;
    });
  }

  function initProductForm(form) {
    var dataEl = form.querySelector("[data-variants]");
    var variants = [];
    try {
      variants = JSON.parse(dataEl ? dataEl.textContent || "[]" : "[]");
    } catch (error) {
      variants = [];
    }
    var idInput = form.querySelector("[name='id']");
    var priceEl = form.querySelector("[data-price]");
    var errorEl = form.querySelector("[data-form-error]");
    var addedEl = form.querySelector("[data-added]");
    var submit = form.querySelector("[type='submit']");

    function currentId() {
      var checked = form.querySelector("input[name='option']:checked");
      return checked ? checked.value : (idInput ? idInput.value : "");
    }

    function sync() {
      var id = currentId();
      if (idInput) idInput.value = id;
      var variant = variants.find(function (item) { return String(item.id) === String(id); });
      if (!variant) return;
      if (priceEl) priceEl.textContent = money(variant.price);
      if (submit) {
        submit.disabled = !variant.available;
        submit.textContent = variant.available ? "Add to bag" : "Sold out";
      }
    }

    form.querySelectorAll("input[name='option']").forEach(function (input) {
      input.addEventListener("change", function () {
        if (addedEl) addedEl.hidden = true;
        sync();
      });
    });

    var qtyInput = form.querySelector("[name='quantity']");
    form.querySelectorAll("[data-qty-step]").forEach(function (button) {
      button.addEventListener("click", function () {
        if (!qtyInput) return;
        var next = Math.max(1, Math.min(10, Number(qtyInput.value || 1) + Number(button.getAttribute("data-qty-step"))));
        qtyInput.value = String(next);
      });
    });

    form.addEventListener("submit", function (event) {
      event.preventDefault();
      if (!idInput) return;
      var qtyInput = form.querySelector("[name='quantity']");
      var quantity = Math.max(1, Number(qtyInput ? qtyInput.value : 1) || 1);
      if (submit) submit.disabled = true;
      if (errorEl) errorEl.hidden = true;
      fetch("/cart/add.js", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ id: Number(idInput.value), quantity: quantity })
      })
        .then(function (res) {
          return res.json().then(function (body) {
            if (!res.ok) throw new Error(body.description || body.message || "Could not add this piece.");
            return fetch("/cart.js");
          });
        })
        .then(function (res) { return res.json(); })
        .then(function (cart) {
          setCount(cart.item_count);
          if (addedEl) addedEl.hidden = false;
        })
        .catch(function (error) {
          if (errorEl) {
            errorEl.hidden = false;
            errorEl.textContent = error.message || "Please try again.";
          }
        })
        .finally(function () {
          if (submit && submit.textContent !== "Sold out") submit.disabled = false;
        });
    });
    sync();
  }

  function initCart() {
    document.querySelectorAll("[data-delta]").forEach(function (button) {
      button.addEventListener("click", function () {
        var line = button.closest("[data-line-key]");
        if (!line) return;
        var next = Math.max(0, Number(line.getAttribute("data-qty")) + Number(button.getAttribute("data-delta")));
        fetch("/cart/change.js", {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ id: line.getAttribute("data-line-key"), quantity: next })
        }).then(function () { window.location.reload(); });
      });
    });

    var form = document.querySelector("[data-whatsapp]");
    if (!form) return;
    form.addEventListener("submit", function (event) {
      event.preventDefault();
      if (!form.reportValidity()) return;
      var cartEl = document.getElementById("CartJson");
      if (!cartEl) return;
      var cart = JSON.parse(cartEl.textContent || "{}");
      var data = new FormData(form);
      var name = String(data.get("name") || "").trim();
      var phone = String(data.get("phone") || "").trim();
      var address = String(data.get("address") || "").trim();
      var shipping = (window.NaeemTheme && window.NaeemTheme.shippingTime) || "2–5 days";
      var lines = [
        "Hello Naeem Collections, I would like to place an order.",
        "",
        "Name: " + name,
        "Phone: " + phone,
        "Address: " + address,
        "",
        "Items:"
      ];
      (cart.items || []).forEach(function (item, index) {
        var variant = item.variant_title && item.variant_title !== "Default Title" ? " (" + item.variant_title + ")" : "";
        lines.push((index + 1) + ". " + item.product_title + variant + " × " + item.quantity + " — " + money(item.final_line_price));
      });
      lines.push("", "Total: " + money(cart.total_price), "", "Delivery: " + shipping);
      var number = String((window.NaeemTheme && window.NaeemTheme.whatsapp) || "923444865085").replace(/\D/g, "");
      window.open("https://wa.me/" + number + "?text=" + encodeURIComponent(lines.join("\n")), "_blank", "noopener");
    });
  }

  function initChrome() {
    var drawer = document.querySelector("[data-drawer]");
    var menu = document.querySelector("[data-menu]");
    var searchModal = document.querySelector("[data-search-modal]");
    var searchOpen = document.querySelector("[data-search-open]");

    function toggle(el, open) {
      if (!el) return;
      el.hidden = !open;
      document.body.style.overflow = open ? "hidden" : "";
    }

    if (menu && drawer) {
      menu.addEventListener("click", function () {
        var open = drawer.hidden;
        toggle(drawer, open);
        menu.setAttribute("aria-expanded", open ? "true" : "false");
      });
      drawer.addEventListener("click", function (event) {
        if (event.target === drawer) {
          toggle(drawer, false);
          menu.setAttribute("aria-expanded", "false");
        }
      });
      drawer.querySelectorAll("[data-drawer-close]").forEach(function (button) {
        button.addEventListener("click", function () {
          toggle(drawer, false);
          menu.setAttribute("aria-expanded", "false");
        });
      });
    }

    if (searchOpen && searchModal) {
      searchOpen.addEventListener("click", function () {
        toggle(searchModal, true);
        var input = searchModal.querySelector("input");
        if (input) input.focus();
      });
      searchModal.querySelectorAll("[data-search-close]").forEach(function (button) {
        button.addEventListener("click", function () { toggle(searchModal, false); });
      });
    }

    document.addEventListener("keydown", function (event) {
      if (event.key !== "Escape") return;
      if (drawer && !drawer.hidden) toggle(drawer, false);
      if (searchModal && !searchModal.hidden) toggle(searchModal, false);
      if (menu) menu.setAttribute("aria-expanded", "false");
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    document.querySelectorAll("[data-hero]").forEach(initHero);
    document.querySelectorAll("[data-product-form]").forEach(initProductForm);
    initCart();
    initChrome();
  });
})();
