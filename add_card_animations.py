import re

with open('index.html', 'r', encoding='utf-8') as f:
    html = f.read()

def replace_with_classes(html, search_str, additional_classes):
    return html.replace(search_str, search_str + ' ' + additional_classes)

# Row 1 cards
c1 = '<!-- Renda 1 -->\n    <div class="bg-white dark:bg-slate-800 p-5 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col justify-center'
c1_new = c1 + ' transition-all duration-300 hover:-translate-y-1 hover:shadow-md animate-fade-in-up'

c2 = '<!-- Renda 2 -->\n    <div class="bg-white dark:bg-slate-800 p-5 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col justify-center'
c2_new = c2 + ' transition-all duration-300 hover:-translate-y-1 hover:shadow-md animate-fade-in-up delay-75'

c3 = '<!-- Saldo -->\n    <div class="bg-slate-900 dark:bg-primary-900 dark:border dark:border-primary-800 text-white p-5 rounded-xl shadow-sm flex flex-col justify-center'
c3_new = c3 + ' transition-all duration-300 hover:-translate-y-1 hover:shadow-md animate-fade-in-up delay-150'

c4 = 'id="dica-dia-container"'
# We need to insert classes into dica-dia-container. Let's find it.
c4_full = '<div class="bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-100 rounded-xl p-5 flex gap-3 shadow-sm items-start hidden" id="dica-dia-container">'
c4_new = '<div class="bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-100 rounded-xl p-5 flex gap-3 shadow-sm items-start hidden transition-all duration-300 hover:-translate-y-1 hover:shadow-md animate-fade-in-up delay-200" id="dica-dia-container">'

html = html.replace(c1, c1_new)
html = html.replace(c2, c2_new)
html = html.replace(c3, c3_new)
html = html.replace(c4_full, c4_new)

# Row 2 cards
# They all start with: <div class="bg-white dark:bg-slate-800 px-5 py-3 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm flex items-center gap-4">
# We can do a regex sub to replace them one by one, giving them increasing delays.
card2_pattern = r'<div class="bg-white dark:bg-slate-800 px-5 py-3 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm flex items-center gap-4">'

delays = ['', 'delay-75', 'delay-150', 'delay-200']
count = 0

def add_hover(match):
    global count
    d = delays[count % 4]
    count += 1
    # Adding hover effects and animations
    return f'<div class="bg-white dark:bg-slate-800 px-5 py-3 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm flex items-center gap-4 transition-all duration-300 hover:-translate-y-1 hover:shadow-md animate-fade-in-up {d}">'

html = re.sub(card2_pattern, add_hover, html)

with open('index.html', 'w', encoding='utf-8') as f:
    f.write(html)
