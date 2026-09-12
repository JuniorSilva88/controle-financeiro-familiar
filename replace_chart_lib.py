import re

with open('index.html', 'r', encoding='utf-8') as f:
    html = f.read()

html = html.replace('<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>', 
                    '<script src="https://code.highcharts.com/highcharts.js"></script>\n  <script src="https://code.highcharts.com/highcharts-3d.js"></script>')

with open('index.html', 'w', encoding='utf-8') as f:
    f.write(html)
