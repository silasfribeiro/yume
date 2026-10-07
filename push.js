// Notificações push no aparelho (OneSignal)
const cfg = window.APP_CONFIG || {};
// App do OneSignal (identificadores públicos). Pode ser trocado em config.js.
const APP_ID = cfg.ONESIGNAL_APP_ID ?? 'b55c2a16-9556-412f-bc43-66bef738f1bb';
const SAFARI_ID = cfg.ONESIGNAL_SAFARI_ID ?? 'web.onesignal.auto.4bf12d4e-2e1c-4e2f-be7e-e4e315c9ca64';
let pronto = null;

export const pushConfigurado = () => !!APP_ID;

export function iniciarPush() {
  if (!pushConfigurado()) return Promise.resolve(null);
  if (pronto) return pronto;
  pronto = new Promise(res => {
    window.OneSignalDeferred = window.OneSignalDeferred || [];
    const s = document.createElement('script');
    s.src = 'https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js';
    s.defer = true;
    s.onerror = () => res(null);
    document.head.appendChild(s);
    window.OneSignalDeferred.push(async (OneSignal) => {
      try {
        await OneSignal.init({
          appId: APP_ID,
          safari_web_id: SAFARI_ID,
          // caminho a partir da raiz do domínio (ex.: 'yume/sw.js' no GitHub Pages)
          serviceWorkerPath: new URL('sw.js', location.href).pathname.replace(/^\//, ''),
          serviceWorkerParam: { scope: new URL('./', location.href).pathname },
          notifyButton: { enable: false },
          welcomeNotification: { disable: true },
        });
        res(OneSignal);
      } catch (e) { console.error('OneSignal', e); res(null); }
    });
  });
  return pronto;
}

export async function statusPush() {
  const O = await iniciarPush();
  if (!O) return 'indisponivel';
  if (!O.Notifications.isPushSupported()) return 'sem-suporte';
  if (O.Notifications.permissionNative === 'denied') return 'bloqueado';
  return O.User.PushSubscription.optedIn ? 'ativo' : 'desligado';
}

export async function ativarPush(email) {
  const O = await iniciarPush();
  if (!O) throw new Error('Não consegui carregar o serviço de notificações');
  if (!O.Notifications.isPushSupported()) throw new Error('Este navegador não suporta notificações. No iPhone, adicione o app à tela inicial primeiro.');
  await O.Notifications.requestPermission();
  if (O.Notifications.permissionNative !== 'granted') throw new Error('Permissão negada. Libere as notificações nas configurações do navegador.');
  await O.User.PushSubscription.optIn();
  if (email) { try { O.User.addTag('email', email); } catch { } }
}

export async function desativarPush() {
  const O = await iniciarPush();
  if (O) await O.User.PushSubscription.optOut();
}
