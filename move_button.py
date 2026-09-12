import re

with open('index.html', 'r', encoding='utf-8') as f:
    html = f.read()

# 1. Remove the old button container
old_button_container = """  <!-- Dashboard Header / Actions -->
  <div class="mb-6 flex justify-end">
    <button id="open-add-modal" class="text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 px-4 py-2 rounded-lg transition-colors flex items-center gap-2 shadow-sm">
      <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path></svg>
      <span>Nova Despesa</span>
    </button>
  </div>"""

if old_button_container in html:
    html = html.replace(old_button_container, "")

# 2. Insert the button in the list header
header_target = """        <div class="flex gap-3 items-center w-full sm:w-auto">
          <div class="relative flex-1 sm:w-64">"""

new_button = """        <div class="flex gap-3 items-center w-full sm:w-auto">
          <button id="open-add-modal" class="text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 px-3 py-1.5 rounded-md transition-colors flex items-center gap-1.5 shadow-sm whitespace-nowrap">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path></svg>
            <span class="hidden sm:inline">Nova Despesa</span>
            <span class="sm:hidden">Nova</span>
          </button>
          <div class="relative flex-1 sm:w-64">"""

if header_target in html:
    html = html.replace(header_target, new_button)
else:
    print("Could not find the header target.")

with open('index.html', 'w', encoding='utf-8') as f:
    f.write(html)
