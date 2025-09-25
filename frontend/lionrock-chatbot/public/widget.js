(function () {
  // --- Styles ---
  const style = document.createElement("style");
  style.innerHTML = `
    .chatbot-widget-button {
      position: fixed;
      bottom: 20px;
      right: 20px;
      background: linear-gradient(135deg, #5182B2, #3a6d99);
      color: white;
      border: none;
      border-radius: 50%;
      width: 65px;
      height: 65px;
      cursor: pointer;
      box-shadow: 0 6px 16px rgba(0,0,0,0.25);
      z-index: 9999;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.3s ease;
    }

    .chatbot-widget-button:hover {
      transform: scale(1.1);
      box-shadow: 0 8px 20px rgba(0,0,0,0.35);
      background: linear-gradient(135deg, #3a6d99, #5182B2);
    }

    .chatbot-widget-iframe {
      position: fixed;
      bottom: 95px;
      right: 20px;
      width: 420px;
      height: 600px;
      border: none;
      border-radius: 20px;
      box-shadow: 0 10px 28px rgba(0,0,0,0.25);
      display: none;
      z-index: 9999;
      overflow: hidden;
      transition: opacity 0.3s ease, transform 0.3s ease;
    }

    .chatbot-widget-iframe.show {
      display: block;
      opacity: 1;
      transform: translateY(0);
    }

    .chatbot-widget-iframe.hide {
      opacity: 0;
      transform: translateY(20px);
      pointer-events: none;
    }

    .chatbot-widget-icon {
      width: 28px;
      height: 28px;
      fill: white;
    }
  `;
  document.head.appendChild(style);

  // --- Button ---
  const button = document.createElement("button");
  button.className = "chatbot-widget-button";
  // Using an SVG chat bubble icon
  button.innerHTML = `
    <svg class="chatbot-widget-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
      <path d="M20 2H4C2.897 2 2 2.897 2 4v14c0 1.103.897 2 2 2h14l4 4V4c0-1.103-.897-2-2-2z"/>
    </svg>
  `;
  document.body.appendChild(button);

  // --- Iframe (points to Next.js chatbot page) ---
  const iframe = document.createElement("iframe");
  iframe.className = "chatbot-widget-iframe hide";
  iframe.src = "http://localhost:3000/";
  document.body.appendChild(iframe);

  // --- Toggle ---
  button.addEventListener("click", () => {
    if (iframe.classList.contains("show")) {
      iframe.classList.remove("show");
      iframe.classList.add("hide");
      setTimeout(() => {
        iframe.style.display = "none";
      }, 300);
    } else {
      iframe.style.display = "block";
      setTimeout(() => {
        iframe.classList.remove("hide");
        iframe.classList.add("show");
      }, 10);
    }
  });
})();