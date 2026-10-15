import { renderLayout } from './layout.js';
import { icons } from './icons.js';

export function renderLoginView(errorMessage?: string): string {
  const body = `
  <div class="max-w-lg mx-auto my-6 sm:my-12">
    
    <!-- Tarjeta Principal de Inicio de Sesión -->
    <div class="bg-white border border-[#E1E7DF] rounded-3xl p-6 sm:p-10 shadow-sm relative overflow-hidden">
      
      <!-- Detalle Superior de Marca Departamental -->
      <div class="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-[#00733B] via-[#00733B] to-[#85BB42]"></div>

      <!-- Cabecera Institucional y Logotipo -->
      <div class="text-center mb-8 pt-2">
        <img 
          src="/img/logo-santacruz.png" 
          alt="Gobierno Autónomo Departamental Santa Cruz" 
          class="h-16 sm:h-20 w-auto mx-auto object-contain mb-4"
          onerror="this.onerror=null; this.src='/public/img/logo-santacruz.png';"
        />

        <div class="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-[#F0F6EC] border border-[#D5E5CD] text-[11px] font-black tracking-wider uppercase mb-3">
          <span class="text-[#00733B]">UNA GESTIÓN</span>
          <span class="text-[#85BB42]">PARA TODOS.</span>
        </div>

        <h1 class="text-xl sm:text-2xl font-bold text-[#112316] tracking-tight">
          Acceso al Sistema Notarial
        </h1>
        <p class="text-xs sm:text-sm text-[#4A6251] mt-1">
          Servicio Departamental de Salud (SEDES) • Residencia Médica Q4 2026
        </p>
      </div>

      ${errorMessage ? `
        <div class="mb-6 p-4 rounded-2xl bg-red-50 border border-red-200 text-red-800 text-xs sm:text-sm flex items-start gap-3">
          <div class="mt-0.5 text-[#E41B24]">
            ${icons.shield('w-4 h-4')}
          </div>
          <div>
            <p class="font-bold">Error de Acceso</p>
            <p class="mt-0.5 text-red-700">${errorMessage}</p>
          </div>
        </div>
      ` : ''}

      <form id="loginForm" action="/login" method="POST" class="space-y-5">
        <div>
          <label for="username" class="block text-xs font-bold text-[#112316] uppercase tracking-wider mb-1.5">
            Usuario Administrador
          </label>
          <div class="relative">
            <div class="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-400">
              ${icons.doctor('w-4 h-4 text-[#00733B]')}
            </div>
            <input 
              type="text" 
              name="username" 
              id="username" 
              required 
              autocomplete="off"
              class="w-full pl-10 pr-4 py-2.5 rounded-xl border border-[#D5E5CD] text-gray-900 text-sm focus:border-[#00733B] focus:outline-none focus:ring-2 focus:ring-[#85BB42]/30 transition-all bg-[#FBFDF9]"
              placeholder="admin"
            />
          </div>
        </div>

        <div>
          <label for="password" class="block text-xs font-bold text-[#112316] uppercase tracking-wider mb-1.5">
            Contraseña Segura
          </label>
          <div class="relative">
            <div class="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-400">
              ${icons.lock('w-4 h-4 text-[#00733B]')}
            </div>
            <input 
              type="password" 
              name="password" 
              id="password" 
              required 
              autocomplete="new-password"
              class="w-full pl-10 pr-4 py-2.5 rounded-xl border border-[#D5E5CD] text-gray-900 text-sm focus:border-[#00733B] focus:outline-none focus:ring-2 focus:ring-[#85BB42]/30 transition-all bg-[#FBFDF9]"
              placeholder="••••••••••••"
            />
          </div>
        </div>

        <div class="pt-3 border-t border-[#E1E7DF]">
          <div class="flex items-center justify-between mb-1.5">
            <label for="entropyWords" class="block text-xs font-bold text-[#112316] uppercase tracking-wider flex items-center gap-1.5">
              ${icons.cloudSun('w-3.5 h-3.5 text-[#00733B]')}
              <span>Palabras de inicio (5 palabras)</span>
            </label>
          </div>
          <p class="text-xs text-[#4A6251] mb-2.5">
            Ingrese 5 palabras clave separadas por espacio (mínimo 4 letras por palabra) para nutrir la semilla criptográfica.
          </p>
          <textarea 
            name="entropyWords" 
            id="entropyWords" 
            rows="2" 
            required
            class="w-full px-4 py-2.5 rounded-xl border border-[#D5E5CD] text-gray-900 text-sm focus:border-[#00733B] focus:outline-none focus:ring-2 focus:ring-[#85BB42]/30 resize-none transition-all bg-[#FBFDF9] font-mono text-xs"
            placeholder="fuego trueno bosque cristal viento"
          ></textarea>

          <div class="mt-2 flex items-center justify-between text-xs text-[#4A6251]">
            <span id="wordCountText" class="font-mono">0 / 5 palabras</span>
            <span id="statusIndicator">Esperando palabras...</span>
          </div>

          <div id="wordPills" class="mt-2.5 flex flex-wrap gap-1.5"></div>
        </div>

        <button 
          type="submit" 
          id="submitBtn" 
          class="w-full py-3.5 px-4 rounded-xl bg-[#00733B] hover:bg-[#005e30] active:bg-[#004e28] text-white font-bold text-sm transition-all mt-6 shadow-sm flex items-center justify-center gap-2 hover:shadow-md">
          ${icons.shield('w-4 h-4 text-[#85BB42]')}
          <span>Ingresar al Panel de Asignación</span>
        </button>
      </form>
    </div>

    <!-- Garantía Institucional -->
    <div class="mt-6 text-center text-xs text-[#4A6251] flex items-center justify-center gap-2">
      ${icons.shield('w-3.5 h-3.5 text-[#00733B]')}
      <span>Protocolo de Cifrado AES-256-GCM y Auditoría SEDES Santa Cruz</span>
    </div>
  </div>
  `;

  const script = `
  <script>
    const textarea = document.getElementById('entropyWords');
    const wordCountText = document.getElementById('wordCountText');
    const statusIndicator = document.getElementById('statusIndicator');
    const wordPills = document.getElementById('wordPills');
    textarea.addEventListener('input', validateEntropy);

    function validateEntropy() {
      const raw = textarea.value.trim();
      if (!raw) {
        wordCountText.textContent = '0 / 5 palabras';
        statusIndicator.textContent = 'Esperando palabras...';
        wordPills.innerHTML = '';
        return;
      }

      const words = raw.split(/\\s+/).filter(Boolean);
      const count = words.length;

      wordPills.innerHTML = '';
      let allValid = true;

      words.forEach((w) => {
        const isMin4 = /^[a-zA-ZáéíóúÁÉÍÓÚñÑüÜ]{4,}$/.test(w);
        if (!isMin4) allValid = false;

        const pill = document.createElement('span');
        pill.className = isMin4 
          ? 'px-2.5 py-1 text-xs rounded-lg bg-[#F0F6EC] text-[#00733B] border border-[#D5E5CD] font-medium'
          : 'px-2.5 py-1 text-xs rounded-lg bg-red-50 text-[#E41B24] border border-red-200 font-medium';
        pill.textContent = w + (isMin4 ? '' : ' (<4 letras)');
        wordPills.appendChild(pill);
      });

      wordCountText.textContent = count + ' / 5 palabras';

      if (count === 5 && allValid) {
        wordCountText.className = 'text-[#00733B] font-bold font-mono';
        statusIndicator.textContent = 'Entropía válida';
        statusIndicator.className = 'text-[#00733B] font-bold';
      } else {
        wordCountText.className = 'text-[#4A6251] font-mono';
        statusIndicator.textContent = count < 5 ? 'Faltan palabras' : (count > 5 ? 'Exceso de palabras' : 'Palabra muy corta');
        statusIndicator.className = 'text-amber-700 font-medium';
      }
    }

    validateEntropy();
  </script>
  `;

  return renderLayout('Iniciar sesión', body, script);
}
