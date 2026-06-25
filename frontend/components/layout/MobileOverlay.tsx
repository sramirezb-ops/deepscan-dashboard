'use client';

// Overlay oscuro del drawer en móvil. Al tocarlo cierra el sidebar
// (mismo gesto que esperas en cualquier app: tap fuera = cerrar).
// Reutiliza las mismas clases (#sb.open / #ov.on) que togglea el Topbar.
export function MobileOverlay() {
  const close = () => {
    document.getElementById('sb')?.classList.remove('open');
    document.getElementById('ov')?.classList.remove('on');
  };
  return <div className="ov" id="ov" onClick={close} aria-hidden="true" />;
}
