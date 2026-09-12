import re

with open('index.html', 'r', encoding='utf-8') as f:
    html = f.read()

html = html.replace('<canvas id="chart" class="max-h-[350px] w-full"></canvas>', 
                    '<div id="chart" class="h-[350px] w-full"></div>')

with open('index.html', 'w', encoding='utf-8') as f:
    f.write(html)
