import { useLocation, useNavigate } from 'react-router-dom';
import { IconButton } from './icons.jsx';
import { t } from '../i18n.js';
import { BEFORE_PAGE_CLOSE } from '../unsaved-navigation.js';

/**
 * The X in the top right corner of every screen behind the login except the map and the running quiz. It always
 * sits in the same place and always returns to the map. (The quiz keeps its own header: leaving mid-attempt is
 * not offered there, just like the disabled back button.)
 */
export function PageClose() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  if (pathname === '/map' || pathname.startsWith('/quiz')) return null;
  const closePage = () => {
    const event = new CustomEvent(BEFORE_PAGE_CLOSE, {
      cancelable: true,
      detail: { confirm: () => navigate('/map') },
    });
    window.dispatchEvent(event);
    if (!event.defaultPrevented) navigate('/map');
  };
  return (
    <IconButton
      icon="close"
      label={t('Close and go to the map')}
      className="page-close"
      onClick={closePage}
    />
  );
}
