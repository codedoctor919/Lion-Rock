(function () {
  // --- Styles ---
  const style = document.createElement("style");
  style.innerHTML = `
    .chatbot-widget-button {
      position: fixed;
      bottom: 20px;
      right: 20px;
      background: #5182B2;
      color: white;
      border: none;
      border-radius: 50%;
      width: 60px;
      height: 60px;
      font-size: 28px;
      cursor: pointer;
      box-shadow: 0 4px 10px rgba(0,0,0,0.2);
      z-index: 9999;
    }
    .chatbot-widget-iframe {
      position: fixed;
      bottom: 90px;
      right: 20px;
      width: 420px;
      height: 600px;
      border: 1px;
      border-radius: 20px;
      box-shadow: 0 8px 24px rgba(0,0,0,0.2);
      display: none;
      z-index: 9999;
    }
  `;
  document.head.appendChild(style);

  // --- Button ---
  const button = document.createElement("button");
  button.className = "chatbot-widget-button";
  button.innerHTML = "💬";
  document.body.appendChild(button);

  // --- Iframe (points to Next.js chatbot page) ---
  const iframe = document.createElement("iframe");
  iframe.className = "chatbot-widget-iframe";
  iframe.src = "http://localhost:3000/";
  document.body.appendChild(iframe);

  // --- Toggle ---
  button.addEventListener("click", () => {
    iframe.style.display = iframe.style.display === "block" ? "none" : "block";
  });
})();