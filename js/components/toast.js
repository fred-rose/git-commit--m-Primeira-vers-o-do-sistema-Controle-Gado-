export function toast(message, error = false) {
  const region = document.getElementById('toasts');
  const item = document.createElement('div');
  item.className = `toast ${error ? 'toast-error' : ''}`;
  item.setAttribute('role', error ? 'alert' : 'status');
  item.textContent = message;
  region.replaceChildren(item);
  setTimeout(() => item.remove(), error ? 10000 : 4500);
}
