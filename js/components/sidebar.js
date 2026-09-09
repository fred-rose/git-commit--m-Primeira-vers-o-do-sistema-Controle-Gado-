import { routes } from '../router.js';
import { icon } from './icons.js';
export function renderSidebar(page) {
  document.querySelector('.menu').innerHTML = Object.entries(routes).map(([key, route]) => `<a class="menu-item ${page === key ? 'active' : ''}" href="#${key}" ${page === key ? 'aria-current="page"' : ''}>${icon(route.icon)}<span>${route.title}</span></a>`).join('');
}
