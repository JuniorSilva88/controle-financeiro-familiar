import re

with open('script.js', 'r', encoding='utf-8') as f:
    js = f.read()

# Locate the onAuthStateChanged callback
# It looks like:
"""
onAuthStateChanged(auth, async (user) => {
  currentUser = user;
  if (user) {
    authBtn.innerHTML = `<span>Sair</span>`;
    authBtn.classList.replace('bg-primary-600', 'bg-slate-600');
    authBtn.classList.replace('hover:bg-primary-700', 'hover:bg-slate-700');
"""

new_auth_code = """onAuthStateChanged(auth, async (user) => {
  currentUser = user;
  const profileContainer = document.getElementById('user-profile-container');
  const profileImg = document.getElementById('user-profile-img');
  
  if (user) {
    authBtn.innerHTML = `<span>Sair</span>`;
    authBtn.classList.replace('bg-primary-600', 'bg-slate-600');
    authBtn.classList.replace('hover:bg-primary-700', 'hover:bg-slate-700');
    
    // Setup Profile Image
    if (profileContainer && profileImg) {
      profileContainer.classList.remove('hidden');
      profileContainer.classList.add('flex');
      if (user.photoURL) {
        profileImg.src = user.photoURL;
      } else {
        const name = user.displayName || user.email || 'U';
        profileImg.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=0D8ABC&color=fff`;
      }
      profileImg.title = user.displayName || user.email || 'Perfil';
    }
"""

js = js.replace("""onAuthStateChanged(auth, async (user) => {
  currentUser = user;
  if (user) {
    authBtn.innerHTML = `<span>Sair</span>`;
    authBtn.classList.replace('bg-primary-600', 'bg-slate-600');
    authBtn.classList.replace('hover:bg-primary-700', 'hover:bg-slate-700');""", new_auth_code)

# Handle the else block (logout)
logout_old = """  } else {
    authBtn.innerHTML = `<span>Login</span>`;
    authBtn.classList.replace('bg-slate-600', 'bg-primary-600');
    authBtn.classList.replace('hover:bg-slate-700', 'hover:bg-primary-700');
    currentFamilyId = null;"""

logout_new = """  } else {
    authBtn.innerHTML = `<span>Login</span>`;
    authBtn.classList.replace('bg-slate-600', 'bg-primary-600');
    authBtn.classList.replace('hover:bg-slate-700', 'hover:bg-primary-700');
    
    // Hide Profile Image
    if (profileContainer) {
      profileContainer.classList.add('hidden');
      profileContainer.classList.remove('flex');
    }
    
    currentFamilyId = null;"""
    
js = js.replace(logout_old, logout_new)

with open('script.js', 'w', encoding='utf-8') as f:
    f.write(js)
