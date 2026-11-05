/**
 * Portal APMED falso, para desenvolver e testar sem uma conta real.
 *
 *   npm run mock:apmed                      # sobe em http://localhost:4010
 *   APMED_BASE_URL=http://localhost:4010/provas npm run dev
 *
 * Qualquer e-mail/senha entra, exceto a senha "errada". As paginas sao
 * PNGs gerados na hora com o numero da pagina.
 */

import http from 'node:http';
import sharp from 'sharp';

const PORTA = Number(process.env.PORTA || 4010);

const MATERIAIS = [
  { id: 1, titulo: 'BIBLIA HSL 2027', inst: 'HSL', paginas: 14, data: '12/09/2026' },
  { id: 2, titulo: 'BIBLIA UNICAMP 2027', inst: 'UNICAMP', paginas: 26, data: '03/10/2026' },
  { id: 3, titulo: 'BIBLIA SUS-SP 2027', inst: 'SUS-SP', paginas: 30, data: '21/08/2026' },
  { id: 4, titulo: 'BIBLIA HRPP 2027', inst: 'HRPP', paginas: 18, data: '15/10/2026' },
  { id: 5, titulo: 'BIBLIA USP-SP 2027', inst: 'USP-SP', paginas: 22, data: '01/10/2026' },
  { id: 6, titulo: 'BIBLIA UNIFESP 2027', inst: 'UNIFESP', paginas: 12, data: '28/09/2026' },
  { id: 7, titulo: 'BIBLIA FAMERP 2026', inst: 'FAMERP', paginas: 10, data: '10/03/2026' },
  { id: 8, titulo: 'BIBLIA IAMSPE 2027', inst: 'IAMSPE', paginas: 16, data: '05/10/2026' },
  { id: 9, titulo: 'BIBLIA SCMSP 2027', inst: 'SCMSP', paginas: 20, data: '19/09/2026' },
  { id: 10, titulo: 'BIBLIA UNICAMP 2026', inst: 'UNICAMP', paginas: 24, data: '02/02/2026' },
  { id: 11, titulo: 'BIBLIA PSU-MG 2027', inst: 'PSU-MG', paginas: 12, data: '11/10/2026' },
  { id: 12, titulo: 'BIBLIA AMRIGS 2027', inst: 'AMRIGS', paginas: 15, data: '30/09/2026' },
];

const cachePng = new Map();
async function pagina(materialId, n, largura) {
  const chave = `${materialId}:${n}:${largura}`;
  if (cachePng.has(chave)) return cachePng.get(chave);
  const w = Math.min(Number(largura) || 2400, 2400);
  const h = Math.round(w * 1.4146);
  const m = MATERIAIS.find((x) => x.id === materialId);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
    <rect width="100%" height="100%" fill="#fff"/>
    <rect x="0" y="0" width="100%" height="${h * 0.08}" fill="#3355ff"/>
    <text x="50%" y="${h * 0.055}" font-size="${w * 0.035}" fill="#fff" text-anchor="middle" font-family="sans-serif">${m.titulo}</text>
    <text x="50%" y="50%" font-size="${w * 0.12}" fill="#0f172a" text-anchor="middle" font-family="sans-serif">${n}</text>
    <text x="50%" y="58%" font-size="${w * 0.03}" fill="#64748b" text-anchor="middle" font-family="sans-serif">pagina ${n} de ${m.paginas} (mock)</text>
  </svg>`;
  const png = await sharp(Buffer.from(svg)).png().toBuffer();
  cachePng.set(chave, png);
  return png;
}

function html(res, corpo) {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(corpo);
}

function json(res, dados, status = 200) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(dados));
}

function logado(req) {
  return /PHPSESSID=mock-/.test(req.headers.cookie || '');
}

http
  .createServer(async (req, res) => {
    const url = new URL(req.url, `http://localhost:${PORTA}`);
    const caminho = url.pathname.replace(/^\/provas/, '');

    if (caminho === '/login.php' && req.method === 'POST') {
      let corpo = '';
      for await (const c of req) corpo += c;
      const dados = new URLSearchParams(corpo);
      if (dados.get('password') === 'errada') return html(res, '<p>Senha incorreta</p>');
      res.writeHead(302, {
        Location: '/provas/aluno/dashboard.php',
        'Set-Cookie': `PHPSESSID=mock-${Date.now().toString(36)}; path=/`,
      });
      return res.end();
    }
    if (caminho === '/logout.php') return html(res, 'ok');

    if (!logado(req)) {
      res.writeHead(302, { Location: '/provas/login.php' });
      return res.end();
    }

    if (caminho === '/aluno/dashboard.php') return html(res, '<h1>Painel</h1>');

    if (caminho === '/aluno/materiais.php') {
      const cards = MATERIAIS.map(
        (m) => `<article class="card">
          <span class="ap-pill">Biblias AP MED</span>
          <span class="ap-pill ap-pill-inst">${m.inst}</span>
          <h2 class="t">${m.titulo}</h2>
          <p class="text-sm text-slate-500">Material completo da banca ${m.inst}.</p>
          <p>Atualizado em ${m.data}</p>
          <a href="material_visualizar.php?id=${m.id}">Abrir</a>
        </article>`,
      ).join('\n');
      return html(res, `<main>${cards}</main>`);
    }

    if (caminho === '/aluno/material_visualizar.php' && url.searchParams.get('reader_token')) {
      return json(res, { ok: true, exp: Math.floor(Date.now() / 1000) + 600, token: 'tk-mock' });
    }

    if (caminho === '/api/material_reader.php') return json(res, { last_page: 1 });

    if (caminho === '/api/material_page.php') {
      const id = Number(url.searchParams.get('material_id'));
      const n = Number(url.searchParams.get('page'));
      const m = MATERIAIS.find((x) => x.id === id);
      if (!m || n < 1 || n > m.paginas) return json(res, { erro: 'nao encontrada' }, 404);
      const png = await pagina(id, n, url.searchParams.get('width'));
      res.writeHead(200, { 'Content-Type': 'image/png', 'Content-Length': png.length });
      return res.end(png);
    }

    json(res, { erro: 'rota desconhecida' }, 404);
  })
  .listen(PORTA, () => console.log(`APMED falso em http://localhost:${PORTA}/provas`));
