import { routes } from '../router.js';
import { icon } from './icons.js';
export function renderSidebar(page, data = {}, profile = {}) {
  document.querySelector('.menu').innerHTML = Object.entries(routes).filter(([key,route]) => (!route.cloudOnly || data.cloud) && (!route.adminOnly || profile.systemRole === 'super_admin') && (key !== 'pastos' || !data.cloud || data.farm?.controlMode === 'pasture')).map(([key, route]) => `<a class="menu-item ${page === key ? 'active' : ''}" href="#${key}" ${page === key ? 'aria-current="page"' : ''}>${icon(route.icon)}<span>${route.title}</span></a>`).join('');
}
