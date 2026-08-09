const kofiButtonDocument = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      html, body { margin: 0; min-height: 40px; overflow: hidden; background: #182228; }
      body { display: flex; align-items: center; justify-content: flex-start; }
    </style>
  </head>
  <body>
    <script src="https://storage.ko-fi.com/cdn/widget/Widget_2.js"></script>
    <script>kofiwidget2.init('Support on Ko-fi', '#E18A24', 'I1F724I7NT');kofiwidget2.draw();</script>
    <style>
      a.kofi-button,
      a.kofi-button:visited,
      a.kofi-button:hover,
      a.kofi-button:active,
      span.kofitext {
        color: #161008 !important;
        text-shadow: none !important;
      }
      a.kofi-button { border-radius: 6px !important; box-shadow: none !important; }
      a.kofi-button:hover { background-color: #F0A145 !important; }
      a.kofi-button:active { background-color: #C87416 !important; }
      img.kofiimg { mix-blend-mode: multiply; }
    </style>
  </body>
</html>`;

export function KoFiButtonWidget() {
  return (
    <iframe
      className="support-kofi-widget"
      title="Support on Ko-fi"
      srcDoc={kofiButtonDocument}
      sandbox="allow-popups allow-popups-to-escape-sandbox allow-scripts"
    />
  );
}
