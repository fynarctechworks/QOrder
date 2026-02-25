import { useLocation, useNavigate, useParams } from 'react-router-dom';

const navItems = [
  {
    label: 'Home',
    icon: (_active: boolean) => (
      <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
        <path d="M11.47 3.84a.75.75 0 011.06 0l8.69 8.69a.75.75 0 01-.53 1.28h-1.44v7.44a.75.75 0 01-.75.75h-4.5a.75.75 0 01-.75-.75v-4.5h-2.25v4.5a.75.75 0 01-.75.75h-4.5a.75.75 0 01-.75-.75v-7.44H3.31a.75.75 0 01-.53-1.28l8.69-8.69z" />
      </svg>
    ),
    path: 'menu',
  },
  {
    label: 'Orders',
    icon: (_active: boolean) => (
      <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
        <path fillRule="evenodd" d="M7.502 6h7.128A3.375 3.375 0 0118 9.375v9.375a3 3 0 003-3V6.108c0-1.505-1.125-2.811-2.664-2.94a48.972 48.972 0 00-.673-.05A3 3 0 0015 1.5h-1.5a3 3 0 00-2.663 1.618c-.225.015-.45.032-.673.05C8.662 3.295 7.554 4.542 7.502 6zM13.5 3A1.5 1.5 0 0012 4.5h4.5A1.5 1.5 0 0015 3h-1.5z" clipRule="evenodd" />
        <path fillRule="evenodd" d="M3 9.375C3 8.339 3.84 7.5 4.875 7.5h9.75c1.036 0 1.875.84 1.875 1.875v11.25c0 1.035-.84 1.875-1.875 1.875h-9.75A1.875 1.875 0 013 20.625V9.375zm9.586 4.594a.75.75 0 00-1.172-.938l-2.476 3.096-.908-.907a.75.75 0 00-1.06 1.06l1.5 1.5a.75.75 0 001.116-.062l3-3.75z" clipRule="evenodd" />
      </svg>
    ),
    path: 'orders',
  },
  {
    label: 'Pay Bill',
    icon: (_active: boolean) => (
      <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
        <path d="M4.5 3.75a3 3 0 00-3 3v.75h21v-.75a3 3 0 00-3-3h-15z" />
        <path fillRule="evenodd" d="M22.5 9.75h-21v7.5a3 3 0 003 3h15a3 3 0 003-3v-7.5zm-18 3.75a.75.75 0 01.75-.75h6a.75.75 0 010 1.5h-6a.75.75 0 01-.75-.75zm.75 2.25a.75.75 0 000 1.5h3a.75.75 0 000-1.5h-3z" clipRule="evenodd" />
      </svg>
    ),
    path: 'pay',
  },
];

export default function BottomNav() {
  const { restaurantSlug, tableId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();

  const basePath = `/r/${restaurantSlug}/t/${tableId}`;

  const isActive = (path: string) => {
    if (path === 'menu') {
      // Home is active on the menu page and category pages
      return location.pathname === `${basePath}/menu` || location.pathname === `${basePath}/menu/` || location.pathname.includes('/category/');
    }
    return location.pathname.includes(`/${path}`);
  };

  const handleNav = (path: string) => {
    navigate(`${basePath}/${path}`);
  };

  // Hide on cart page and landing page
  if (location.pathname.includes('/cart')) return null;
  if (location.pathname === basePath || location.pathname === `${basePath}/`) return null;

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-[9998] bg-white border-t border-gray-100 safe-bottom">
      <div className="flex items-center justify-around h-16">
        {navItems.map((item) => {
          const active = isActive(item.path);
          return (
            <button
              key={item.label}
              onClick={() => handleNav(item.path)}
              aria-label={item.label}
              className={`flex flex-col items-center justify-center gap-0.5 flex-1 h-full transition-colors duration-200 ${
                active ? 'text-primary' : 'text-gray-400'
              }`}
            >
              <div className="flex items-center justify-center w-6 h-6">
                {item.icon(active)}
              </div>
              <span className={`text-[10px] font-medium ${active ? 'text-primary' : 'text-gray-400'}`}>
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
