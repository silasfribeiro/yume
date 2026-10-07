import { sb, S, q, todos, carregarTudo, salvarConfig } from './db.js';
import { pushConfigurado, statusPush, ativarPush, desativarPush } from './push.js';
import { corBadge, ic, esc, toast, modal, confirmar, baixarArquivo, $ } from './ui.js';

const CORES = ['#A6C969', '#CADBB7', '#FEE398', '#EFF2EE', '#F6F1DB', '#D9C2E0', '#F4C7C3', '#BFD8E8'];

function editar(tabela, item, campos) {
  const d = item || {};
  modal(`<div class="mh"><h2>${item ? 'Editar' : 'Adicionar'}</h2><button class="btn ghost icon-only" data-close>${ic('x')}</button></div>
    <form id="fx">
      <div class="field"><label class="f">Nome</label><input class="in" name="nome" required value="${esc(d.nome || '')}"></div>
      ${campos.includes('cor') ? `<label class="f">Cor da etiqueta</label><div class="row field" id="cores">${CORES.map(c => `<button type="button" data-c="${c}" title="${c}" style="width:34px;height:34px;border-radius:50%;background:${c};border:3px solid ${(d.cor || CORES[0]) === c ? 'var(--oliva)' : 'var(--borda-forte)'};cursor:pointer"></button>`).join('')}
        <label id="outraCor" title="Outra cor" style="position:relative;height:34px;padding:0 12px;border-radius:999px;display:inline-flex;align-items:center;gap:6px;cursor:pointer;font-weight:800;font-size:.85rem;border:3px solid ${d.cor && !CORES.includes(d.cor) ? 'var(--oliva)' : 'var(--borda-forte)'};${d.cor && !CORES.includes(d.cor) ? corBadge(d.cor) : 'background:conic-gradient(from 0deg,#F4C7C3,#FEE398,#A6C969,#BFD8E8,#D9C2E0,#F4C7C3)'}">
          <span>${ic('plus')}</span>Outras
          <input type="color" id="corIn" value="${d.cor && /^#[0-9a-f]{6}$/i.test(d.cor) ? d.cor : '#A6C969'}" style="position:absolute;inset:0;opacity:0;width:100%;height:100%;cursor:pointer;border:0;padding:0"></label></div>
      <div class="row field"><span class="small muted">Prévia:</span><span class="badge" id="previa" style="${corBadge(d.cor || CORES[0])}">${esc(d.nome || 'Etiqueta')}</span></div>` : ''}
      ${campos.includes('descricao') ? `<div class="field"><label class="f">Descrição</label><textarea class="in" name="descricao">${esc(d.descricao || '')}</textarea></div>` : ''}
      <button class="btn full">${ic('check')}Salvar</button></form>`, {
    onMount: (m, close) => {
      let cor = d.cor || CORES[0];
      const cs = $('#cores', m);
      const marcar = (el) => { cs.querySelectorAll('button,#outraCor').forEach(x => x.style.borderColor = x === el ? 'var(--oliva)' : 'var(--borda-forte)'); const p = $('#previa', m); p.setAttribute('style', corBadge(cor)); p.textContent = m.querySelector('[name=nome]').value || 'Etiqueta'; };
      if (cs) {
        cs.onclick = e => { const b = e.target.closest('button[data-c]'); if (!b) return; cor = b.dataset.c; marcar(b); };
        const ci = $('#corIn', m), oc = $('#outraCor', m);
        ci.oninput = () => { cor = ci.value; const [bg, fg] = corBadge(cor).split(';'); oc.style.background = bg.split(':')[1]; oc.style.color = fg.split(':')[1]; marcar(oc); };
        m.querySelector('[name=nome]').addEventListener('input', () => { $('#previa', m).textContent = m.querySelector('[name=nome]').value || 'Etiqueta'; });
      }
      $('#fx', m).onsubmit = async e => {
        e.preventDefault(); const f = new FormData(e.target);
        const reg = { nome: f.get('nome').trim() };
        if (campos.includes('cor')) reg.cor = cor;
        if (campos.includes('descricao')) reg.descricao = f.get('descricao').trim() || null;
        if (tabela === 'locais' && !item) reg.tipo = 'outro';
        try {
          if (item) await q(sb.from(tabela).update(reg).eq('id', item.id)); else await q(sb.from(tabela).insert(reg));
          await carregarTudo(); close(); toast('Salvo'); window.rotear();
        } catch (err) { toast(/duplicate/i.test(err.message) ? 'Já existe um com esse nome' : err.message, true); }
      };
    }
  });
}

export async function render(el) {
  const { data: { user } } = await sb.auth.getUser();
  const locais = S.locais.filter(l => l.tipo !== 'evento');
  const tipoNome = { atelie: 'Estoque principal', box: 'Box', outro: 'Outro' };
  const usados = (campo, id) => S.produtos.filter(p => p[campo] === id).length;

  el.innerHTML = `
    <div class="page-head"><h1>Configurações</h1></div>
    <div class="grid g2 stack-sm" style="align-items:start">
      <div class="card"><div class="row between"><h3>Categorias</h3><button class="btn sm" data-add="categorias">${ic('plus')}Nova</button></div>
        <div class="list">${S.categorias.map(c => `<div class="li"><span class="badge" style="${corBadge(c.cor)}">${esc(c.nome)}</span><span class="grow small muted">${usados('categoria_id', c.id)} produto(s)</span>
          <button class="btn ghost icon-only" data-ed="categorias" data-id="${c.id}">${ic('edit')}</button><button class="btn ghost icon-only" data-del="categorias" data-id="${c.id}">${ic('trash')}</button></div>`).join('')}</div></div>
      <div class="stack">
        <div class="card"><div class="row between"><h3>Coleções</h3><button class="btn sm" data-add="colecoes">${ic('plus')}Nova</button></div>
          ${S.colecoes.length ? `<div class="list">${S.colecoes.map(c => `<div class="li"><div class="grow"><b>${esc(c.nome)}</b><div class="small muted">${usados('colecao_id', c.id)} produto(s)</div></div>
            <button class="btn ghost icon-only" data-ed="colecoes" data-id="${c.id}">${ic('edit')}</button><button class="btn ghost icon-only" data-del="colecoes" data-id="${c.id}">${ic('trash')}</button></div>`).join('')}</div>` : '<p class="small muted">Ex.: "Poções & Feitiços", "Outono"...</p>'}</div>
        <div class="card"><div class="row between"><h3>Locais de estoque</h3><button class="btn sm" data-add="locais">${ic('plus')}Novo</button></div>
          <div class="list">${locais.map(l => `<div class="li"><div class="grow"><b>${esc(l.nome)}</b>${l.ativo === false ? ' <span class="badge nevoa">inativo</span>' : ''}<div class="small muted">${tipoNome[l.tipo]}</div></div>
            <button class="btn ghost icon-only" data-ed="locais" data-id="${l.id}">${ic('edit')}</button>${l.tipo === 'outro' ? `<button class="btn ghost icon-only" data-del="locais" data-id="${l.id}">${ic('trash')}</button>` : ''}</div>`).join('')}</div>
          <p class="small muted" style="margin-bottom:0">Os custos do Box (aluguel/comissão) ficam na tela do Box.</p></div>
        <div class="card" id="notif"><h3>🔔 Notificações</h3>
          <div class="list" style="margin-top:6px">
            <div class="li"><div class="grow"><b>Push neste aparelho</b><div class="small muted" id="pushStatus">${pushConfigurado() ? 'verificando...' : 'ainda não configurado'}</div></div><span id="pushBtn"></span></div>
            <div class="li"><div class="grow"><b>Telegram</b><div class="small muted">${S.config.telegram_chat_id ? 'grupo conectado ✓' : 'ainda não configurado'}</div></div></div>
          </div>
          <label class="f" style="margin-top:10px">Avisar quando:</label>
          ${[['notif_venda', '💰 Uma venda for registrada'], ['notif_estoque', '⚠️ Um produto ficar com estoque baixo ou esgotar no Box'], ['notif_contagem', '📋 A contagem do Box for feita'], ['notif_evento', '🎪 Um evento for fechado'], ['notif_resumo', '📊 Resumo semanal (segunda, 9h)']]
            .map(([k, t]) => `<label class="small" style="display:flex;align-items:flex-start;gap:8px;padding:6px 0;cursor:pointer"><input type="checkbox" style="margin-top:3px;flex:none" data-notif="${k}" ${S.config[k] === false ? '' : 'checked'}><span>${t}</span></label>`).join('')}
          <button class="btn sec sm" id="notifTeste" style="margin-top:8px">Enviar notificação de teste</button>
          <p class="small muted" style="margin-bottom:0">As notificações valem para vocês dois. No iPhone, o push só funciona com o app adicionado à tela inicial.</p></div>
        <div class="card"><h3>${ic('backup')} Backup</h3>
          <p class="small" style="margin-top:6px">Baixa todos os dados (produtos, estoque, vendas, eventos) num arquivo. Vale fazer uma vez por mês e guardar no Drive.</p>
          <button class="btn sec" id="bkp">${ic('download')}Baixar backup</button></div>
        <div class="card"><h3>Conta</h3><p class="small" style="margin-top:6px">Conectado como <b>${esc(user?.email || '')}</b></p>
          <div class="row"><button class="btn sec" id="senha">${ic('edit')}Trocar minha senha</button><button class="btn sec" id="sair">${ic('logout')}Sair</button></div></div>
      </div>
    </div>`;

  const lista = t => t === 'categorias' ? S.categorias : t === 'colecoes' ? S.colecoes : S.locais;
  const campos = t => t === 'categorias' ? ['cor'] : t === 'colecoes' ? ['descricao'] : [];
  el.querySelectorAll('[data-add]').forEach(b => b.onclick = () => editar(b.dataset.add, null, campos(b.dataset.add)));
  el.querySelectorAll('[data-ed]').forEach(b => b.onclick = () => editar(b.dataset.ed, lista(b.dataset.ed).find(x => x.id === b.dataset.id), campos(b.dataset.ed)));
  el.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
    const t = b.dataset.del, item = lista(t).find(x => x.id === b.dataset.id);
    const extra = t === 'locais' ? '' : ' Os produtos dessa categoria/coleção ficam "sem".';
    if (!(await confirmar(`Excluir <b>${esc(item.nome)}</b>?${extra}`, { ok: 'Excluir', perigo: true }))) return;
    try { await q(sb.from(t).delete().eq('id', item.id)); await carregarTudo(); toast('Excluído'); window.rotear(); }
    catch (e) {
      if (t === 'locais' && /foreign key|violates/i.test(e.message)) {
        if (await confirmar('Esse local já tem histórico de estoque, então não dá pra excluir. Quer <b>desativar</b>? (Antes, transfira o que sobrou nele.)', { ok: 'Desativar' })) {
          await q(sb.from('locais').update({ ativo: false }).eq('id', item.id)); await carregarTudo(); window.rotear();
        }
      } else toast(e.message, true);
    }
  });
  $('#bkp', el).onclick = async () => {
    const b = $('#bkp', el); b.disabled = true; b.textContent = 'Gerando...';
    try {
      const tabelas = ['categorias', 'colecoes', 'locais', 'eventos', 'produtos', 'vendas', 'venda_itens', 'movimentacoes', 'contagens', 'configuracoes'];
      const dados = {};
      for (const t of tabelas) dados[t] = await todos(() => sb.from(t).select('*'));
      baixarArquivo(`backup-yume-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify({ gerado_em: new Date().toISOString(), ...dados }, null, 1), 'application/json');
      toast('Backup baixado 🌿');
    } catch (e) { toast(e.message, true); }
    b.disabled = false; b.innerHTML = `${ic('download')}Baixar backup`;
  };
  $('#sair', el).onclick = () => sb.auth.signOut();
  el.querySelectorAll('[data-notif]').forEach(cb => cb.onchange = async () => {
    try { await salvarConfig(cb.dataset.notif, cb.checked); toast(cb.checked ? 'Aviso ligado' : 'Aviso desligado'); }
    catch (e) { toast(e.message, true); cb.checked = !cb.checked; }
  });
  $('#notifTeste', el).onclick = async () => {
    try { await q(sb.rpc('notificar_teste')); toast('Teste enviado! Deve chegar em alguns segundos 🌿'); } catch (e) { toast(e.message, true); }
  };
  const desenharPush = async () => {
    if (!pushConfigurado()) return;
    const st = await statusPush();
    const nomes = { ativo: 'ativado ✓', desligado: 'desligado', bloqueado: 'bloqueado no navegador', 'sem-suporte': 'não suportado aqui (no iPhone, adicione à tela inicial)', indisponivel: 'não carregou' };
    const s = $('#pushStatus', el); if (!s) return;
    s.textContent = nomes[st] || st;
    const b = $('#pushBtn', el);
    b.innerHTML = st === 'ativo' ? `<button class="btn sec sm">Desativar</button>` : (st === 'desligado' ? `<button class="btn sm">Ativar</button>` : '');
    const btn = b.querySelector('button'); if (!btn) return;
    btn.onclick = async () => {
      btn.disabled = true;
      try { if (st === 'ativo') await desativarPush(); else { await ativarPush(user?.email); toast('Notificações ativadas neste aparelho 🔔'); } }
      catch (e) { toast(e.message, true); }
      desenharPush();
    };
  };
  desenharPush();
  $('#senha', el).onclick = () => modal(`<div class="mh"><h2>Trocar senha</h2><button class="btn ghost icon-only" data-close>${ic('x')}</button></div>
    <form id="fs"><div class="field"><label class="f">Nova senha (mínimo 8 caracteres)</label><input class="in" type="password" name="s1" minlength="8" autocomplete="new-password" required></div>
    <div class="field"><label class="f">Repita a nova senha</label><input class="in" type="password" name="s2" minlength="8" autocomplete="new-password" required></div>
    <button class="btn full">${ic('check')}Salvar nova senha</button></form>`, {
    onMount: (m, close) => $('#fs', m).onsubmit = async e => {
      e.preventDefault(); const f = new FormData(e.target);
      if (f.get('s1') !== f.get('s2')) { toast('As senhas não são iguais', true); return; }
      const { error } = await sb.auth.updateUser({ password: f.get('s1') });
      if (error) toast(error.message, true); else { close(); toast('Senha alterada 🌿'); }
    }
  });
}
