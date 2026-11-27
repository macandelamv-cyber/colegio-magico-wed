// ==========================================
// 1. CONFIGURACIÓN DE SUPABASE (COMPLETÁ AQUÍ)
// ==========================================
const SUPABASE_URL = "https://suwnzfjtmlggpcjlvdge.supabase.co/rest/v1/";
const SUPABASE_ANON_KEY = "sb_publishable_P_bIoGuRQT4tSpjIJFsbsQ_EeNo5Ckt";

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ==========================================
// 2. ESTADO GLOBAL DE LA APP
// ==========================================
const state = {
  student: null,
  tab: "profile", // 'profile' | 'bank' | 'shop' | 'album' | 'friends' | 'games' | 'support' | 'admin'
  quizStep: 0,
  quizAnswers: [],
  allStudents: [],
  shopItems: [],
  myItemIds: new Set(),
  cardsCatalog: [],
  myCardsMap: new Map(), // card_id -> quantity
  friendIds: new Set(),
  transactions: [],
  lastPackOpened: null,
  searchQuery: "",
  message: "",
  error: ""
};

const TRIVIA_QUESTIONS = [
  {
    q: "¿Qué objeto revela lo que más deseamos en el fondo de nuestro corazón?",
    options: ["El Giratiempo", "El Espejo de Oesed", "La Piedra Filosofal", "El Pensadero"],
    answer: 1
  },
  {
    q: "¿Cuál es el encantamiento para desarmar a un oponente?",
    options: ["Lumos", "Alohomora", "Expelliarmus", "Wingardium Leviosa"],
    answer: 2
  },
  {
    q: "¿Qué criatura mágica siente atracción por los objetos brillantes?",
    options: ["Escarbato", "Bowtruckle", "Sapo", "Lechuza"],
    answer: 0
  }
];

const SORTING_QUESTIONS = [
  {
    q: "¿Qué valor defendés por encima de todo?",
    options: [
      { label: "Valentía y coraje", house: "Gryffindor" },
      { label: "Astucia y ambición", house: "Slytherin" },
      { label: "Sabiduría e ingenio", house: "Ravenclaw" },
      { label: "Lealtad y trabajo duro", house: "Hufflepuff" }
    ]
  },
  {
    q: "Si encontrás un misterio en el colegio, ¿qué hacés?",
    options: [
      { label: "Entro a investigar de frente", house: "Gryffindor" },
      { label: "Busco ventaja antes que nadie", house: "Slytherin" },
      { label: "Investigo pistas y libros", house: "Ravenclaw" },
      { label: "Convoco a mis amigos para ir juntos", house: "Hufflepuff" }
    ]
  },
  {
    q: "Elegí un escenario ideal:",
    options: [
      { label: "Torre alta con chimenea encendida", house: "Gryffindor" },
      { label: "Mazmorra bajo el lago con luz verde", house: "Slytherin" },
      { label: "Torre con vista a las estrellas", house: "Ravenclaw" },
      { label: "Sala acogedora llena de plantas", house: "Hufflepuff" }
    ]
  }
];

const PATRONUS_OPTIONS = [
  "Ciervo Plateado",
  "Nutria",
  "Zorro Ártico",
  "Lobo Nocturno",
  "Búho Nival",
  "Fénix"
];

function notify(msg, isError = false) {
  state.message = isError ? "" : msg;
  state.error = isError ? msg : "";
  render();
}

function clearNotices() {
  state.message = "";
  state.error = "";
}

// ==========================================
// 3. CARGA DE DATOS DESDE SUPABASE
// ==========================================
async function refreshAllData() {
  if (!state.student) return;

  const { data: me } = await sb
    .from("students")
    .select("*")
    .eq("id", state.student.id)
    .single();
  if (me) state.student = me;

  const [{ data: students }, { data: items }, { data: myItems }, { data: cards }, { data: myCards }, { data: friends }, { data: txs }] =
    await Promise.all([
      sb.from("students").select("*").order("house_points", { ascending: false }),
      sb.from("shop_items").select("*").order("created_at", { ascending: true }),
      sb.from("student_items").select("item_id").eq("student_id", state.student.id),
      sb.from("collectible_cards").select("*").order("number_code", { ascending: true }),
      sb.from("student_cards").select("card_id, quantity").eq("student_id", state.student.id),
      sb.from("friendships").select("friend_id").eq("student_id", state.student.id),
      sb.from("transactions").select("*").eq("student_id", state.student.id).order("created_at", { ascending: false }).limit(20)
    ]);

  state.allStudents = students || [];
  state.shopItems = items || [];
  state.myItemIds = new Set((myItems || []).map((r) => r.item_id));
  state.cardsCatalog = cards || [];
  state.myCardsMap = new Map((myCards || []).map((r) => [r.card_id, r.quantity]));
  state.friendIds = new Set((friends || []).map((r) => r.friend_id));
  state.transactions = txs || [];
}

// ==========================================
// 4. LOGIN / REGISTRO (NOMBRE MÁGICO + PIN)
// ==========================================
async function handleAuth(magicNameRaw, pinRaw) {
  clearNotices();
  const magic_name = (magicNameRaw || "").trim();
  const pin_code = (pinRaw || "").trim();

  if (!magic_name || !pin_code) {
    return notify("Completá tu Nombre Mágico y tu PIN.", true);
  }

  const { data: existing, error: findErr } = await sb
    .from("students")
    .select("*")
    .ilike("magic_name", magic_name)
    .maybeSingle();

  if (findErr) return notify("Error al consultar la base de datos: " + findErr.message, true);

  if (existing) {
    if (existing.pin_code !== pin_code) {
      return notify("Ese Nombre Mágico ya existe y el PIN no coincide.", true);
    }
    state.student = existing;
    localStorage.setItem("lunaris_student_id", existing.id);
    await refreshAllData();
    notify(`¡Bienvenido/a de nuevo, ${existing.magic_name}!`);
  } else {
    const { data: created, error: createErr } = await sb
      .from("students")
      .insert([{ magic_name, pin_code, galleons: 50, house_points: 0 }])
      .select()
      .single();

    if (createErr) return notify("No se pudo crear el perfil: " + createErr.message, true);

    await sb.from("transactions").insert([{
      student_id: created.id,
      galleons_delta: 50,
      points_delta: 0,
      reason: "Bono de bienvenida de Gringotts"
    }]);

    state.student = created;
    localStorage.setItem("lunaris_student_id", created.id);
    await refreshAllData();
    notify(`¡Perfil creado! Recibiste 50 Galeones de bienvenida.`);
  }
}

function logout() {
  state.student = null;
  state.lastPackOpened = null;
  localStorage.removeItem("lunaris_student_id");
  clearNotices();
  render();
}

// ==========================================
// 5. TEST DE CASA Y PATRONUS
// ==========================================
async function answerSorting(house) {
  state.quizAnswers.push(house);
  if (state.quizStep < SORTING_QUESTIONS.length - 1) {
    state.quizStep += 1;
    render();
    return;
  }

  const counts = {};
  for (const h of state.quizAnswers) counts[h] = (counts[h] || 0) + 1;
  const chosenHouse = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
  const chosenPatronus = PATRONUS_OPTIONS[Math.floor(Math.random() * PATRONUS_OPTIONS.length)];

  const { error } = await sb
    .from("students")
    .update({ house: chosenHouse, patronus: chosenPatronus })
    .eq("id", state.student.id);

  state.quizStep = 0;
  state.quizAnswers = [];

  if (error) return notify("Error al guardar Casa/Patronus: " + error.message, true);
  await refreshAllData();
  notify(`¡Tu Casa es ${chosenHouse} y tu Patronus es ${chosenPatronus}!`);
}

// ==========================================
// 6. TIENDA (VARITAS / MASCOTAS) Y ÁLBUM
// ==========================================
async function buyItem(item) {
  clearNotices();
  if (state.myItemIds.has(item.id)) return notify("Ya tenés este ítem en tu colección.", true);
  if (item.is_vip_only && !state.student.is_vip) {
    return notify("Este ítem es exclusivo para quienes apoyan al colegio (VIP).", true);
  }

  const cost = item.is_vip_only ? 0 : (item.price_galleons || 0);
  if (!item.is_vip_only && state.student.galleons < cost) {
    return notify(`Te faltan Galeones. Cuesta ${cost} y tenés ${state.student.galleons}.`, true);
  }

  const newGalleons = state.student.galleons - cost;
  await sb.from("students").update({ galleons: newGalleons }).eq("id", state.student.id);
  await sb.from("student_items").insert([{
    student_id: state.student.id,
    item_id: item.id,
    acquired_via: item.is_vip_only ? "vip" : "galleons"
  }]);
  await sb.from("transactions").insert([{
    student_id: state.student.id,
    galleons_delta: -cost,
    points_delta: 0,
    reason: `Compra en Callejón Diagon: ${item.name}`
  }]);

  await refreshAllData();
  notify(`¡Conseguiste ${item.name}!`);
}

async function equipItem(itemId, category) {
  const field = category === "wand" ? "equipped_wand_id" : "equipped_pet_id";
  await sb.from("students").update({ [field]: itemId }).eq("id", state.student.id);
  await refreshAllData();
  notify("¡Equipado en tu perfil!");
}

function pickWeightedCard() {
  const totalWeight = state.cardsCatalog.reduce((acc, c) => acc + (c.drop_weight || 10), 0);
  let r = Math.random() * totalWeight;
  for (const c of state.cardsCatalog) {
    r -= (c.drop_weight || 10);
    if (r <= 0) return c;
  }
  return state.cardsCatalog[0];
}

async function openCardPack(isFree) {
  clearNotices();
  if (!state.cardsCatalog.length) return notify("No hay figuritas cargadas todavía.", true);

  const PACK_COST = 80;
  const TWO_DAYS_MS = 48 * 60 * 60 * 1000;

  if (isFree) {
    if (state.student.last_free_pack_at) {
      const elapsed = Date.now() - new Date(state.student.last_free_pack_at).getTime();
      if (elapsed < TWO_DAYS_MS) {
        const hoursLeft = Math.ceil((TWO_DAYS_MS - elapsed) / (1000 * 60 * 60));
        return notify(`Todavía faltan unas ${hoursLeft}h para tu próximo paquete gratis.`, true);
      }
    }
  } else {
    if (state.student.galleons < PACK_COST) {
      return notify(`Necesitás ${PACK_COST} Galeones para abrir un paquete de 3 figuritas.`, true);
    }
  }

  let currentGalleons = state.student.galleons - (isFree ? 0 : PACK_COST);
  let refundGalleons = 0;
  const opened = [];

  for (let i = 0; i < 3; i++) {
    const card = pickWeightedCard();
    const hadBefore = state.myCardsMap.has(card.id) || opened.some((o) => o.card.id === card.id);
    const prevQty = state.myCardsMap.get(card.id) || 0;
    const nextQty = prevQty + 1;

    await sb.from("student_cards").upsert(
      { student_id: state.student.id, card_id: card.id, quantity: nextQty },
      { onConflict: "student_id,card_id" }
    );
    state.myCardsMap.set(card.id, nextQty);

    let dupBonus = 0;
    if (hadBefore) {
      dupBonus = card.rarity === "Épica" ? 20 : card.rarity === "Rara" ? 10 : 5;
      refundGalleons += dupBonus;
    }

    opened.push({ card, isDuplicate: hadBefore, dupBonus });
  }

  currentGalleons += refundGalleons;

  const updates = { galleons: currentGalleons };
  if (isFree) updates.last_free_pack_at = new Date().toISOString();

  await sb.from("students").update(updates).eq("id", state.student.id);
  await sb.from("transactions").insert([{
    student_id: state.student.id,
    galleons_delta: -(isFree ? 0 : PACK_COST) + refundGalleons,
    points_delta: 0,
    reason: isFree
      ? `Paquete gratis de 3 figuritas${refundGalleons ? ` (+${refundGalleons} por repetidas)` : ""}`
      : `Paquete de 3 figuritas (${PACK_COST}G)${refundGalleons ? ` (+${refundGalleons} por repetidas)` : ""}`
  }]);

  state.lastPackOpened = opened;
  await refreshAllData();
  notify(`¡Abriste 3 figuritas!${refundGalleons ? ` Recuperaste +${refundGalleons} Galeones por repetidas.` : ""}`);
}

// ==========================================
// 7. AMIGOS Y TRIVIA DIARIA
// ==========================================
async function toggleFriend(targetId) {
  if (targetId === state.student.id) return;
  if (state.friendIds.has(targetId)) {
    await sb.from("friendships").delete().eq("student_id", state.student.id).eq("friend_id", targetId);
  } else {
    await sb.from("friendships").insert([{ student_id: state.student.id, friend_id: targetId }]);
  }
  await refreshAllData();
  render();
}

async function submitTrivia(selectedIndexes) {
  clearNotices();
  const ONE_DAY_MS = 24 * 60 * 60 * 1000;
  if (state.student.last_trivia_at && Date.now() - new Date(state.student.last_trivia_at).getTime() < ONE_DAY_MS) {
    return notify("Ya completaste la Trivia de hoy. ¡Volvé mañana!", true);
  }

  let correct = 0;
  TRIVIA_QUESTIONS.forEach((q, idx) => {
    if (selectedIndexes[idx] === q.answer) correct += 1;
  });

  const earnedGalleons = correct * 10;
  const earnedPoints = correct * 5;

  await sb
    .from("students")
    .update({
      galleons: state.student.galleons + earnedGalleons,
      house_points: state.student.house_points + earnedPoints,
      last_trivia_at: new Date().toISOString()
    })
    .eq("id", state.student.id);

  await sb.from("transactions").insert([{
    student_id: state.student.id,
    galleons_delta: earnedGalleons,
    points_delta: earnedPoints,
    reason: `Trivia Diaria (${correct}/${TRIVIA_QUESTIONS.length} aciertos)`
  }]);

  await refreshAllData();
  notify(`¡Acertaste ${correct}/${TRIVIA_QUESTIONS.length}! Ganaste +${earnedGalleons} Galeones y +${earnedPoints} Puntos de Casa.`);
}

// ==========================================
// 8. PANEL DE ADMINISTRACIÓN (DIRECTORA)
// ==========================================
async function adminAdjustBalance(studentId, gDelta, pDelta, reasonText) {
  const target = state.allStudents.find((s) => s.id === studentId);
  if (!target) return;
  const g = parseInt(gDelta || 0, 10);
  const p = parseInt(pDelta || 0, 10);

  await sb
    .from("students")
    .update({
      galleons: Math.max(0, target.galleons + g),
      house_points: Math.max(0, target.house_points + p)
    })
    .eq("id", studentId);

  await sb.from("transactions").insert([{
    student_id: studentId,
    galleons_delta: g,
    points_delta: p,
    reason: reasonText || "Ajuste desde Administración"
  }]);

  await refreshAllData();
  notify(`Actualizado ${target.magic_name}: ${g >= 0 ? "+" : ""}${g}G, ${p >= 0 ? "+" : ""}${p} pts.`);
}

async function adminToggleVip(student) {
  const nextVip = !student.is_vip;
  await sb.from("students").update({ is_vip: nextVip }).eq("id", student.id);
  await refreshAllData();
  notify(`${student.magic_name} ahora es ${nextVip ? "VIP (Apoyo activo)" : "Alumno estándar"}.`);
}

async function adminCreateItem(name, category, emoji, rarity, priceGalleons, isVipOnly, imageUrl, description) {
  if (!name) return notify("Poné un nombre para el ítem.", true);
  const { error } = await sb.from("shop_items").insert([{
    name,
    category,
    emoji: emoji || "✨",
    rarity: rarity || "Común",
    price_galleons: isVipOnly ? null : parseInt(priceGalleons || 100, 10),
    is_vip_only: Boolean(isVipOnly),
    image_url: imageUrl || null,
    description: description || ""
  }]);
  if (error) return notify("Error al crear ítem: " + error.message, true);
  await refreshAllData();
  notify(`Ítem "${name}" creado en la tienda.`);
}

async function adminCreateCard(numberCode, name, albumSection, rarity, emoji, imageUrl, description) {
  if (!name) return notify("Poné un nombre para la figurita.", true);
  const weight = rarity === "Épica" ? 15 : rarity === "Rara" ? 45 : 120;
  const { error } = await sb.from("collectible_cards").insert([{
    number_code: numberCode || "#099",
    name,
    album_section: albumSection || "Personajes",
    rarity: rarity || "Común",
    emoji: emoji || "🃏",
    image_url: imageUrl || null,
    description: description || "",
    drop_weight: weight
  }]);
  if (error) return notify("Error al crear figurita: " + error.message, true);
  await refreshAllData();
  notify(`Figurita "${name}" agregada al álbum.`);
}

// ==========================================
// 9. INTERFAZ (RENDER)
// ==========================================
function render() {
  const root = document.getElementById("app");

  if (SUPABASE_URL.includes("PEGA_AQUI") || SUPABASE_ANON_KEY.includes("PEGA_AQUI")) {
    root.innerHTML = `
      <div class="bg-amber-950/50 border border-amber-500/40 rounded-2xl p-6 mt-10">
        <h1 class="text-xl font-bold text-amber-300 mb-2">Falta pegar tus claves de Supabase</h1>
        <p class="text-slate-300 text-sm">Abrí <code>app.js</code> en GitHub y reemplazá <code>SUPABASE_URL</code> y <code>SUPABASE_ANON_KEY</code> con los datos de tu proyecto.</p>
      </div>`;
    return;
  }

  const noticeHtml = `
    ${state.message ? `<div class="mb-4 p-3 rounded-xl bg-emerald-950/70 border border-emerald-500/40 text-emerald-200 text-sm">${state.message}</div>` : ""}
    ${state.error ? `<div class="mb-4 p-3 rounded-xl bg-rose-950/70 border border-rose-500/40 text-rose-200 text-sm">${state.error}</div>` : ""}
  `;

  if (!state.student) {
    root.innerHTML = `
      <div class="max-w-md mx-auto mt-10 bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl">
        <div class="text-center mb-6">
          <div class="text-4xl mb-2">🏰✨</div>
          <h1 class="text-2xl font-bold text-amber-300">Colegio Mágico</h1>
          <p class="text-slate-400 text-sm mt-1">Ingresá con tu Nombre Mágico y PIN (o creá tu cuenta)</p>
        </div>
        ${noticeHtml}
        <form id="authForm" class="space-y-4">
          <div>
            <label class="block text-xs uppercase tracking-wider text-slate-400 mb-1">Nombre Mágico</label>
            <input id="authName" type="text" required placeholder="Ej: LunaSilver"
              class="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 focus:border-amber-400 outline-none" />
          </div>
          <div>
            <label class="block text-xs uppercase tracking-wider text-slate-400 mb-1">PIN de acceso</label>
            <input id="authPin" type="password" required placeholder="Ej: 1234"
              class="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 focus:border-amber-400 outline-none" />
          </div>
          <button type="submit" class="w-full py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold transition">
            Entrar al Portal
          </button>
        </form>
      </div>`;

    document.getElementById("authForm").addEventListener("submit", (e) => {
      e.preventDefault();
      handleAuth(document.getElementById("authName").value, document.getElementById("authPin").value);
    });
    return;
  }

  const s = state.student;
  const equippedWand = state.shopItems.find((i) => i.id === s.equipped_wand_id);
  const equippedPet = state.shopItems.find((i) => i.id === s.equipped_pet_id);

  const navTabs = [
    ["profile", "🪪 Perfil"],
    ["bank", "🏦 Gringotts"],
    ["shop", "🛍️ Callejón Diagon"],
    ["album", "🃏 Álbum"],
    ["friends", "👥 Amigos"],
    ["games", "🎲 Juegos"],
    ["support", "💛 Apoyo / VIP"],
    ["admin", "⚙️ Admin"]
  ];

  let bodyHtml = "";

  if (state.tab === "profile") {
    const needsTest = s.house === "Sin asignar" || s.patronus === "Sin definir";
    const q = SORTING_QUESTIONS[state.quizStep];

    bodyHtml = `
      <div class="grid md:grid-cols-3 gap-6">
        <div class="md:col-span-2 bg-slate-900/90 border ${s.is_vip ? "border-amber-400/70" : "border-slate-800"} rounded-2xl p-6">
          <div class="flex flex-wrap items-center justify-between gap-2 mb-4">
            <div>
              <span class="text-xs uppercase tracking-wider text-amber-400">${s.is_vip ? "⭐ Miembro VIP" : "Estudiante"}</span>
              <h2 class="text-2xl font-bold">${s.magic_name}</h2>
            </div>
            <div class="flex gap-3">
              <div class="bg-slate-950 px-3.5 py-2 rounded-xl border border-slate-800 text-center">
                <div class="text-xs text-slate-400">Galeones</div>
                <div class="font-bold text-amber-300">🪙 ${s.galleons}</div>
              </div>
              <div class="bg-slate-950 px-3.5 py-2 rounded-xl border border-slate-800 text-center">
                <div class="text-xs text-slate-400">Puntos de Casa</div>
                <div class="font-bold text-indigo-300">🏆 ${s.house_points}</div>
              </div>
            </div>
          </div>

          <div class="grid sm:grid-cols-2 gap-3 mb-6">
            <div class="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800">
              <div class="text-xs text-slate-400">Casa</div>
              <div class="text-lg font-semibold mt-0.5">${s.house}</div>
            </div>
            <div class="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800">
              <div class="text-xs text-slate-400">Patronus</div>
              <div class="text-lg font-semibold mt-0.5">${s.patronus}</div>
            </div>
            <div class="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800">
              <div class="text-xs text-slate-400">Varita equipada</div>
              <div class="text-base font-medium mt-0.5">${equippedWand ? `${equippedWand.emoji} ${equippedWand.name}` : "🪄 Varita básica"}</div>
            </div>
            <div class="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800">
              <div class="text-xs text-slate-400">Mascota equipada</div>
              <div class="text-base font-medium mt-0.5">${equippedPet ? `${equippedPet.emoji} ${equippedPet.name}` : "Sin mascota equipada"}</div>
            </div>
          </div>

          ${needsTest ? `
            <div class="p-5 rounded-2xl bg-indigo-950/40 border border-indigo-500/30">
              <h3 class="font-bold text-indigo-200 mb-1">Sombrero Seleccionador y Patronus (${state.quizStep + 1}/${SORTING_QUESTIONS.length})</h3>
              <p class="text-sm text-slate-300 mb-4">${q.q}</p>
              <div class="grid sm:grid-cols-2 gap-2.5">
                ${q.options.map((opt) => `
                  <button onclick="answerSorting('${opt.house}')" class="text-left p-3 rounded-xl bg-slate-900 hover:bg-indigo-900/50 border border-slate-700 text-sm transition">
                    ${opt.label}
                  </button>
                `).join("")}
              </div>
            </div>
          ` : `
            <div class="text-xs text-slate-400">
              Figuritas únicas coleccionadas: <strong class="text-slate-200">${state.myCardsMap.size}</strong> / ${state.cardsCatalog.length} · Amigos: <strong class="text-slate-200">${state.friendIds.size}</strong>
            </div>
          `}
        </div>

        <div class="bg-slate-900/90 border border-slate-800 rounded-2xl p-5">
          <h3 class="font-bold text-amber-300 mb-3">🏆 Ranking de Alumnos</h3>
          <div class="space-y-2">
            ${state.allStudents.slice(0, 8).map((st, idx) => `
              <div class="flex items-center justify-between text-sm p-2.5 rounded-xl bg-slate-950/70 border border-slate-800/70">
                <div>
                  <span class="text-slate-400 mr-1.5">#${idx + 1}</span>
                  <span class="font-medium">${st.magic_name}</span>
                  <span class="block text-xs text-slate-400">${st.house}</span>
                </div>
                <span class="font-semibold text-indigo-300">${st.house_points} pts</span>
              </div>
            `).join("")}
          </div>
        </div>
      </div>`;
  } else if (state.tab === "bank") {
    bodyHtml = `
      <div class="bg-slate-900/90 border border-slate-800 rounded-2xl p-6">
        <div class="flex flex-wrap items-center justify-between gap-4 mb-6">
          <div>
            <h2 class="text-xl font-bold text-amber-300">🏦 Banco Gringotts</h2>
            <p class="text-xs text-slate-400">Los Galeones sirven para ítems y figuritas; los Puntos de Casa son para el ranking.</p>
          </div>
          <div class="text-2xl font-bold text-amber-300 bg-slate-950 px-4 py-2 rounded-xl border border-amber-500/30">
            🪙 ${s.galleons} Galeones
          </div>
        </div>
        <h3 class="text-sm font-semibold text-slate-300 mb-3">Últimos movimientos</h3>
        <div class="space-y-2">
          ${state.transactions.length ? state.transactions.map((t) => `
            <div class="flex items-center justify-between p-3 rounded-xl bg-slate-950 border border-slate-800 text-sm">
              <div>
                <div class="font-medium">${t.reason}</div>
                <div class="text-xs text-slate-500">${new Date(t.created_at).toLocaleString()}</div>
              </div>
              <div class="text-right font-semibold">
                ${t.galleons_delta !== 0 ? `<span class="${t.galleons_delta > 0 ? "text-emerald-400" : "text-rose-400"}">${t.galleons_delta > 0 ? "+" : ""}${t.galleons_delta}G</span>` : ""}
                ${t.points_delta !== 0 ? `<span class="ml-2 text-indigo-300">${t.points_delta > 0 ? "+" : ""}${t.points_delta} pts</span>` : ""}
              </div>
            </div>
          `).join("") : `<p class="text-sm text-slate-400">Todavía no tenés movimientos.</p>`}
        </div>
      </div>`;
  } else if (state.tab === "shop") {
    const renderShopSection = (title, category) => {
      const list = state.shopItems.filter((i) => i.category === category);
      return `
        <div class="mb-8">
          <h3 class="text-lg font-bold text-amber-300 mb-3">${title}</h3>
          <div class="grid sm:grid-cols-2 md:grid-cols-3 gap-4">
            ${list.map((item) => {
              const owned = state.myItemIds.has(item.id);
              const equipped = (category === "wand" && s.equipped_wand_id === item.id) || (category === "pet" && s.equipped_pet_id === item.id);
              return `
                <div class="bg-slate-900 border ${item.is_vip_only ? "border-amber-500/40" : "border-slate-800"} rounded-2xl p-4 flex flex-col justify-between">
                  <div>
                    <div class="flex items-center justify-between mb-2">
                      <span class="text-3xl">${item.emoji}</span>
                      <span class="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-300">${item.rarity}</span>
                    </div>
                    <h4 class="font-bold">${item.name}</h4>
                    <p class="text-xs text-slate-400 mt-1">${item.description || ""}</p>
                  </div>
                  <div class="mt-4 pt-3 border-t border-slate-800 flex items-center justify-between gap-2">
                    <span class="text-sm font-semibold text-amber-300">
                      ${item.is_vip_only ? "⭐ Exclusivo VIP" : `🪙 ${item.price_galleons}G`}
                    </span>
                    ${owned
                      ? (equipped
                          ? `<span class="text-xs px-3 py-1.5 rounded-lg bg-emerald-950 text-emerald-300 border border-emerald-500/30">Equipado</span>`
                          : `<button onclick="equipItem('${item.id}', '${category}')" class="text-xs px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700">Equipar</button>`)
                      : `<button onclick='buyItem(${JSON.stringify(item).replace(/'/g, "&#39;")})' class="text-xs px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold">Conseguir</button>`
                    }
                  </div>
                </div>`;
            }).join("")}
          </div>
        </div>`;
    };

    bodyHtml = `
      <div class="bg-slate-900/50 border border-slate-800 rounded-2xl p-6">
        ${renderShopSection("🪄 Varitas Mágicas", "wand")}
        ${renderShopSection("🦉 Mascotas", "pet")}
      </div>`;
  } else if (state.tab === "album") {
    bodyHtml = `
      <div class="bg-slate-900/90 border border-slate-800 rounded-2xl p-6">
        <div class="flex flex-wrap items-center justify-between gap-4 mb-6">
          <div>
            <h2 class="text-xl font-bold text-amber-300">🃏 Álbum de Figuritas</h2>
            <p class="text-xs text-slate-400">Abrí sobres de 3 figuritas: 1 gratis cada 2 días o por 80 Galeones. Las repetidas devuelven Galeones.</p>
          </div>
          <div class="flex flex-wrap gap-2">
            <button onclick="openCardPack(true)" class="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-sm">
              🎁 Paquete Gratis (cada 2 días)
            </button>
            <button onclick="openCardPack(false)" class="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-sm">
              🪙 Comprar Paquete (80G)
            </button>
          </div>
        </div>

        ${state.lastPackOpened ? `
          <div class="mb-6 p-4 rounded-2xl bg-amber-950/30 border border-amber-500/40">
            <div class="text-sm font-bold text-amber-300 mb-3">¡Último sobre abierto!</div>
            <div class="grid sm:grid-cols-3 gap-3">
              ${state.lastPackOpened.map((entry) => `
                <div class="p-3 rounded-xl bg-slate-950 border border-slate-800">
                  <div class="text-2xl">${entry.card.emoji}</div>
                  <div class="font-bold text-sm mt-1">${entry.card.number_code} · ${entry.card.name}</div>
                  <div class="text-xs text-slate-400">${entry.card.rarity} · ${entry.card.album_section}</div>
                  <div class="text-xs mt-1 ${entry.isDuplicate ? "text-amber-300" : "text-emerald-400"}">
                    ${entry.isDuplicate ? `Repetida (+${entry.dupBonus}G)` : "¡Nueva!"}
                  </div>
                </div>
              `).join("")}
            </div>
          </div>
        ` : ""}

        <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          ${state.cardsCatalog.map((card) => {
            const qty = state.myCardsMap.get(card.id) || 0;
            const unlocked = qty > 0;
            return `
              <div class="p-3.5 rounded-xl border ${unlocked ? "bg-slate-950 border-slate-700" : "bg-slate-950/40 border-slate-800/60 opacity-55"}">
                <div class="flex items-center justify-between text-xs text-slate-400 mb-1">
                  <span>${card.number_code}</span>
                  <span>${card.rarity}</span>
                </div>
                <div class="text-2xl mb-1">${unlocked ? card.emoji : "❓"}</div>
                <div class="font-semibold text-sm">${unlocked ? card.name : "Figurita bloqueada"}</div>
                <div class="text-xs text-slate-400 mt-0.5">${card.album_section}</div>
                ${qty > 1 ? `<div class="mt-2 inline-block text-xs px-2 py-0.5 rounded bg-amber-500/20 text-amber-300">x${qty}</div>` : ""}
              </div>`;
          }).join("")}
        </div>
      </div>`;
  } else if (state.tab === "friends") {
    const filtered = state.allStudents.filter(
      (st) => st.id !== s.id && st.magic_name.toLowerCase().includes(state.searchQuery.toLowerCase())
    );
    bodyHtml = `
      <div class="bg-slate-900/90 border border-slate-800 rounded-2xl p-6">
        <h2 class="text-xl font-bold text-amber-300 mb-3">👥 Comunidad y Amigos</h2>
        <input type="text" value="${state.searchQuery}" oninput="state.searchQuery = this.value; render();"
          placeholder="Buscar alumno por Nombre Mágico..."
          class="w-full max-w-md px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-700 mb-5 text-sm outline-none" />
        <div class="grid sm:grid-cols-2 md:grid-cols-3 gap-4">
          ${filtered.map((st) => {
            const isFriend = state.friendIds.has(st.id);
            return `
              <div class="p-4 rounded-2xl bg-slate-950 border border-slate-800 flex flex-col justify-between">
                <div>
                  <div class="font-bold text-base">${st.magic_name} ${st.is_vip ? "⭐" : ""}</div>
                  <div class="text-xs text-slate-400 mt-1">Casa: <span class="text-slate-200">${st.house}</span></div>
                  <div class="text-xs text-slate-400">Patronus: <span class="text-slate-200">${st.patronus}</span></div>
                  <div class="text-xs text-indigo-300 mt-1">🏆 ${st.house_points} pts · 🪙 ${st.galleons}G</div>
                </div>
                <button onclick="toggleFriend('${st.id}')" class="mt-4 w-full py-1.5 rounded-xl text-xs font-semibold ${isFriend ? "bg-slate-800 text-slate-200" : "bg-amber-500 text-slate-950"}">
                  ${isFriend ? "✓ En tu lista de amigos" : "+ Agregar amigo"}
                </button>
              </div>`;
          }).join("")}
        </div>
      </div>`;
  } else if (state.tab === "games") {
    bodyHtml = `
      <div class="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 max-w-2xl">
        <h2 class="text-xl font-bold text-amber-300 mb-1">🎲 Trivia Mágica Diaria</h2>
        <p class="text-xs text-slate-400 mb-5">Respondé las 3 preguntas (1 vez cada 24 horas). Cada acierto suma +10 Galeones y +5 Puntos de Casa.</p>
        <form id="triviaForm" class="space-y-5">
          ${TRIVIA_QUESTIONS.map((item, qIdx) => `
            <div class="p-4 rounded-xl bg-slate-950 border border-slate-800">
              <div class="font-semibold text-sm mb-2.5">${qIdx + 1}. ${item.q}</div>
              <div class="space-y-1.5">
                ${item.options.map((opt, oIdx) => `
                  <label class="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
                    <input type="radio" name="q_${qIdx}" value="${oIdx}" ${oIdx === 0 ? "checked" : ""} />
                    <span>${opt}</span>
                  </label>
                `).join("")}
              </div>
            </div>
          `).join("")}
          <button type="submit" class="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-sm">
            Enviar respuestas
          </button>
        </form>
      </div>`;
  } else if (state.tab === "support") {
    bodyHtml = `
      <div class="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 max-w-2xl">
        <h2 class="text-xl font-bold text-amber-300 mb-2">💛 Apoyar al Colegio / Pase VIP</h2>
        <p class="text-sm text-slate-300 mb-4">
          Todo el contenido principal, juegos y álbum son gratuitos. Si querés apoyar el proyecto o conseguir ítems/ventajas estéticas más rápido, podés hacer un aporte voluntario y enviarme tu comprobante junto a tu <strong>Nombre Mágico</strong>.
        </p>
        <div class="flex flex-wrap gap-3 mb-5">
          <a href="https://link.mercadopago.com.ar" target="_blank" rel="noreferrer" class="px-4 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold text-sm">
            Mercado Pago (Argentina)
          </a>
          <a href="https://paypal.me" target="_blank" rel="noreferrer" class="px-4 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-semibold text-sm">
            PayPal / Internacional
          </a>
        </div>
        <div class="p-4 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-400 space-y-1">
          <div>• Tu Nombre Mágico actual es: <strong class="text-amber-300">${s.magic_name}</strong></div>
          <div>• Una vez verificado el pago, te activo el estado VIP o te acredito tus Galeones desde el panel.</div>
        </div>
      </div>`;
  } else if (state.tab === "admin") {
    bodyHtml = `
      <div class="space-y-6">
        <div class="bg-slate-900/90 border border-slate-800 rounded-2xl p-6">
          <h2 class="text-xl font-bold text-amber-300 mb-1">⚙️ Panel de Administración</h2>
          <p class="text-xs text-slate-400 mb-4">Acá podés ver usuarios y PINs, acreditar Galeones/Puntos por actividades de WhatsApp y activar VIP.</p>
          <div class="overflow-x-auto">
            <table class="w-full text-left text-xs border-collapse">
              <thead>
                <tr class="border-b border-slate-800 text-slate-400">
                  <th class="py-2 pr-3">Nombre Mágico</th>
                  <th class="py-2 pr-3">PIN</th>
                  <th class="py-2 pr-3">Casa</th>
                  <th class="py-2 pr-3">Galeones</th>
                  <th class="py-2 pr-3">Puntos</th>
                  <th class="py-2 pr-3">VIP</th>
                  <th class="py-2">Cargar rápido (+20G / +10pts)</th>
                </tr>
              </thead>
              <tbody>
                ${state.allStudents.map((st) => `
                  <tr class="border-b border-slate-900">
                    <td class="py-2.5 pr-3 font-semibold">${st.magic_name}</td>
                    <td class="py-2.5 pr-3 font-mono text-slate-300">${st.pin_code}</td>
                    <td class="py-2.5 pr-3">${st.house}</td>
                    <td class="py-2.5 pr-3 text-amber-300">${st.galleons}</td>
                    <td class="py-2.5 pr-3 text-indigo-300">${st.house_points}</td>
                    <td class="py-2.5 pr-3">
                      <button onclick='adminToggleVip(${JSON.stringify(st).replace(/'/g, "&#39;")})' class="px-2 py-1 rounded ${st.is_vip ? "bg-amber-500 text-slate-950 font-semibold" : "bg-slate-800 text-slate-300"}">
                        ${st.is_vip ? "VIP" : "No"}
                      </button>
                    </td>
                    <td class="py-2.5">
                      <button onclick="adminAdjustBalance('${st.id}', 20, 10, 'Actividad en WhatsApp')" class="px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-medium">
                        +20G / +10pts
                      </button>
                    </td>
                  </tr>
                `).join("")}
              </tbody>
            </table>
          </div>
        </div>

        <div class="grid md:grid-cols-2 gap-6">
          <form id="newItemForm" class="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 space-y-3">
            <h3 class="font-bold text-amber-300">➕ Nuevo Ítem (Varita / Mascota)</h3>
            <input id="itemName" placeholder="Nombre del ítem" class="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-sm" required />
            <div class="grid grid-cols-3 gap-2">
              <select id="itemCat" class="px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-sm">
                <option value="wand">Varita</option>
                <option value="pet">Mascota</option>
              </select>
              <input id="itemEmoji" placeholder="Emoji (🪄)" class="px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-sm" />
              <select id="itemRarity" class="px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-sm">
                <option>Común</option>
                <option>Rara</option>
                <option>Épica</option>
              </select>
            </div>
            <div class="grid grid-cols-2 gap-2">
              <input id="itemPrice" type="number" placeholder="Precio en Galeones" class="px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-sm" />
              <label class="flex items-center gap-2 text-xs text-slate-300 px-2">
                <input id="itemVip" type="checkbox" /> Solo VIP / Apoyo
              </label>
            </div>
            <input id="itemImg" placeholder="Link de imagen (opcional)" class="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-sm" />
            <input id="itemDesc" placeholder="Descripción corta" class="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-sm" />
            <button type="submit" class="px-4 py-2 rounded-xl bg-amber-500 text-slate-950 font-semibold text-sm">Guardar Ítem</button>
          </form>

          <form id="newCardForm" class="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 space-y-3">
            <h3 class="font-bold text-amber-300">➕ Nueva Figurita del Álbum</h3>
            <div class="grid grid-cols-3 gap-2">
              <input id="cardNum" placeholder="#025" class="px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-sm" />
              <input id="cardName" placeholder="Nombre figurita" class="col-span-2 px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-sm" required />
            </div>
            <div class="grid grid-cols-3 gap-2">
              <input id="cardSec" placeholder="Sección" value="Personajes" class="px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-sm" />
              <select id="cardRarity" class="px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-sm">
                <option>Común</option>
                <option>Rara</option>
                <option>Épica</option>
              </select>
              <input id="cardEmoji" placeholder="Emoji (🃏)" class="px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-sm" />
            </div>
            <input id="cardImg" placeholder="Link de imagen (opcional)" class="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-sm" />
            <input id="cardDesc" placeholder="Descripción corta" class="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-sm" />
            <button type="submit" class="px-4 py-2 rounded-xl bg-amber-500 text-slate-950 font-semibold text-sm">Guardar Figurita</button>
          </form>
        </div>
      </div>`;
  }

  root.innerHTML = `
    <header class="flex flex-wrap items-center justify-between gap-3 mb-6 pb-4 border-b border-slate-800">
      <div class="flex items-center gap-2.5">
        <span class="text-2xl">🏰</span>
        <div>
          <h1 class="font-bold text-lg text-amber-300 leading-tight">Colegio Mágico</h1>
          <div class="text-xs text-slate-400">Hola, <strong class="text-slate-200">${s.magic_name}</strong> · 🪙 ${s.galleons}G · 🏆 ${s.house_points} pts</div>
        </div>
      </div>
      <button onclick="logout()" class="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs">
        Salir
      </button>
    </header>

    <nav class="flex flex-wrap gap-2 mb-6">
      ${navTabs.map(([id, label]) => `
        <button onclick="state.tab = '${id}'; clearNotices(); render();"
          class="px-3.5 py-2 rounded-xl text-xs sm:text-sm font-medium transition ${state.tab === id ? "bg-amber-500 text-slate-950 font-semibold" : "bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800"}">
          ${label}
        </button>
      `).join("")}
    </nav>

    ${noticeHtml}
    ${bodyHtml}
  `;

  const triviaForm = document.getElementById("triviaForm");
  if (triviaForm) {
    triviaForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const answers = TRIVIA_QUESTIONS.map((_, idx) => {
        const checked = document.querySelector(`input[name="q_${idx}"]:checked`);
        return checked ? parseInt(checked.value, 10) : -1;
      });
      submitTrivia(answers);
    });
  }

  const newItemForm = document.getElementById("newItemForm");
  if (newItemForm) {
    newItemForm.addEventListener("submit", (e) => {
      e.preventDefault();
      adminCreateItem(
        document.getElementById("itemName").value,
        document.getElementById("itemCat").value,
        document.getElementById("itemEmoji").value,
        document.getElementById("itemRarity").value,
        document.getElementById("itemPrice").value,
        document.getElementById("itemVip").checked,
        document.getElementById("itemImg").value,
        document.getElementById("itemDesc").value
      );
    });
  }

  const newCardForm = document.getElementById("newCardForm");
  if (newCardForm) {
    newCardForm.addEventListener("submit", (e) => {
      e.preventDefault();
      adminCreateCard(
        document.getElementById("cardNum").value,
        document.getElementById("cardName").value,
        document.getElementById("cardSec").value,
        document.getElementById("cardRarity").value,
        document.getElementById("cardEmoji").value,
        document.getElementById("cardImg").value,
        document.getElementById("cardDesc").value
      );
    });
  }
}

// Restaurar sesión si había una abierta
(async function init() {
  const savedId = localStorage.getItem("lunaris_student_id");
  if (savedId && !SUPABASE_URL.includes("PEGA_AQUI")) {
    const { data } = await sb.from("students").select("*").eq("id", savedId).maybeSingle();
    if (data) {
      state.student = data;
      await refreshAllData();
    }
  }
  render();
})();
