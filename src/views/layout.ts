import { icons } from './icons.js';

export function renderLayout(title: string, bodyContent: string, extraScripts: string = ''): string {
  return `<!DOCTYPE html>
<html lang="es">
<head><link rel="icon" type="image/png" href="/img/logo-santacruz.png?v=20261009">
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} | Gobierno Autónomo Departamental de Santa Cruz</title>
  
  <!-- Tailwind CSS CDN con Configuración Institucional de Santa Cruz -->
  <script src="https://cdn.tailwindcss.com"></script>
  <script>
    tailwind.config = {
      theme: {
        extend: {
          colors: {
            scz: {
              dark: '#00733B',     // Verde Institucional Oscuro Santa Cruz (SC)
              green: '#00733B',
              light: '#85BB42',    // Verde Claro Manzana Santa Cruz (Z)
              lime: '#85BB42',
              red: '#E41B24',      // Rojo Cruz Potenzada
              bg: '#F8FAF6',       // Fondo institucional suave
              surface: '#FFFFFF',
              border: '#E1E7DF',
              text: '#112316',
              muted: '#4A6251'
            }
          }
        }
      }
    }
  </script>

  <!-- Canvas Confetti -->
  <script src="https://cdn.jsdelivr.net/npm/canvas-confetti@1.9.3/dist/confetti.browser.min.js"></script>

  <style>
    @media print {
      .no-print { display: none !important; }
      body { background: white !important; color: black !important; }
    }
    ::selection {
      background-color: #85BB42;
      color: #ffffff;
    }
  </style>
</head>
<body class="bg-[#F8FAF6] text-[#112316] min-h-screen flex flex-col font-sans antialiased selection:bg-[#85BB42] selection:text-white">
  
  <!-- Franja Institucional Departamental Bicolor (Verde Bandera Cruceña) -->
  <div class="h-1.5 w-full bg-gradient-to-r from-[#00733B] via-[#00733B] to-[#85BB42] no-print"></div>

  <!-- Barra de Navegación Oficial -->
  <header class="border-b border-[#E1E7DF] bg-white/95 backdrop-blur-md sticky top-0 z-40 shadow-xs no-print">
    <div class="max-w-6xl mx-auto px-4 sm:px-6 h-20 flex items-center justify-between gap-4">
      
      <!-- Logotipo Oficial del Gobierno Autónomo Departamental de Santa Cruz -->
      <a href="/" class="flex items-center gap-3.5 hover:opacity-95 transition-opacity py-1">
        <img 
          src="/img/logo-santacruz.png" 
          alt="Gobierno Autónomo Departamental Santa Cruz" 
          class="h-12 sm:h-14 w-auto object-contain"
          onerror="this.onerror=null; this.src='/public/img/logo-santacruz.png';"
        />
        <div class="hidden md:flex flex-col border-l border-[#E1E7DF] pl-3.5">
          <span class="text-xs font-bold tracking-tight text-[#00733B] uppercase">Servicio Departamental de Salud</span>
          <span class="text-[11px] text-[#4A6251] font-medium">Asignación Oficial de Residencia Médica Q4 2026</span>
        </div>
      </a>

      <!-- Lema Institucional y Controles de Usuario -->
      <div class="flex items-center space-x-3 sm:space-x-5">
        
        <!-- Badge Lema Oficial: UNA GESTIÓN PARA TODOS -->
        <div class="hidden lg:flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-[#F0F6EC] border border-[#D5E5CD] shadow-2xs">
          <span class="w-2 h-2 rounded-full bg-[#00733B]"></span>
          <span class="text-xs font-black tracking-wider uppercase text-[#00733B]">UNA GESTIÓN</span>
          <span class="text-xs font-black tracking-wider uppercase text-[#85BB42]">PARA TODOS.</span>
        </div>

        <div class="flex items-center gap-2">
          <div class="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gray-50 border border-[#E1E7DF] text-xs font-medium text-[#4A6251]">
            ${icons.shield('w-3.5 h-3.5 text-[#00733B]')}
            <span>Auditoría SEDES</span>
          </div>

          <a 
            href="/logout" 
            title="Cerrar sesión segura" 
            class="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold text-[#4A6251] hover:text-[#E41B24] hover:bg-red-50 border border-transparent hover:border-red-200 transition-all">
            ${icons.logout('w-3.5 h-3.5')}
            <span class="hidden sm:inline">Cerrar sesión</span>
          </a>
        </div>
      </div>
    </div>
  </header>

  <!-- Contenido Principal -->
  <main class="flex-grow max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-10 w-full">
    ${bodyContent}
  </main>

  <!-- Pie de Página Institucional -->
  <footer class="border-t border-[#E1E7DF] bg-white mt-12 py-8 text-xs text-[#4A6251] no-print">
    <div class="max-w-6xl mx-auto px-4 sm:px-6">
      <div class="flex flex-col md:flex-row items-center justify-between gap-4 pb-6 border-b border-[#E1E7DF]">
        <div class="flex items-center gap-3 text-left">
          <img 
            src="/img/logo-santacruz.png" 
            alt="Gobierno Autónomo Departamental Santa Cruz" 
            class="h-8 w-auto object-contain grayscale opacity-80 hover:grayscale-0 hover:opacity-100 transition-all"
          />
          <div>
            <p class="font-bold text-[#00733B]">Gobierno Autónomo Departamental de Santa Cruz</p>
            <p class="text-[11px] text-[#4A6251]">Servicio Departamental de Salud (SEDES) • Dirección Departamental de Salud</p>
          </div>
        </div>

        <div class="text-center md:text-right">
          <div class="inline-flex items-center gap-1 text-xs font-black tracking-wider uppercase mb-1">
            <span class="text-[#00733B]">UNA GESTIÓN</span>
            <span class="text-[#85BB42]">PARA TODOS.</span>
          </div>
          <p class="text-[11px] text-[#4A6251]">Sorteo Criptográfico Transparente e Inmutable de Residencia Médica</p>
        </div>
      </div>

      <div class="pt-4 flex flex-col sm:flex-row items-center justify-between text-[11px] text-gray-500 gap-2">
        <p>© 2026 Gobierno Autónomo Departamental de Santa Cruz. Todos los derechos reservados.</p>
        <p class="flex items-center gap-1.5 font-mono">
          ${icons.shield('w-3 h-3 text-[#00733B]')}
          <span>Blindaje Criptográfico HMAC-SHA256 • Entropía Ambiental Auditada</span>
        </p>
      </div>
    </div>
  </footer>

  ${extraScripts}
</body>
</html>`;
}
