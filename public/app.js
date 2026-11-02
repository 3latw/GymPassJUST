import { installLanguageSwitcher } from "/i18n.js";
import {
  icon,
  escapeText as escape,
  loginMarkup,
  shellMarkup,
  portalMarkup,
  classFormMarkup,
  accountMarkup,
  accountsMarkup,
} from "/ui.js";
installLanguageSwitcher();
const root = document.querySelector("#root"),
  modal = document.querySelector("#modal"),
  modalBody = document.querySelector("#modal-body");
const roleNames = {
  member: "طالب",
  instructor: "مدرب الحصص",
  manager: "مدير المركز",
};
const typeNames = {
  strength: "قوة وتحمل",
  yoga: "يوغا",
  spinning: "دراجات",
  fitness: "لياقة",
};
const stateNames = {
  confirmed: "مؤكد",
  checked_in: "تم تسجيل الحضور",
  attended: "حضر",
  no_show: "غائب",
  waitlisted: "قائمة الانتظار",
  cancelled: "ملغى",
  not_promoted: "انتهى الانتظار",
};
const errors = {
  ALREADY_SUBSCRIBED:
    "أنت مشترك بالفعل في هذه الباقة. يمكنك الاشتراك مجدداً بعد انتهائها.",
  NOT_BOOKED: "الطالب غير مسجّل بحجز مؤكد في هذه الحصة.",
  INVALID_LOGIN: "الإيميل أو كلمة المرور غير صحيحة.",
  INVALID_ACCOUNT: "تأكد من الاسم والبريد الإلكتروني.",
  WEAK_PASSWORD: "كلمة المرور لازم تكون من 12 إلى 128 حرفاً.",
  EMAIL_EXISTS: "هذا الإيميل مسجّل مسبقاً. جرّب تسجيل الدخول.",
  INVALID_CLASS:
    "تأكد من بيانات الحصة. الموعد لازم يكون بالمستقبل والمدة أقل من 4 ساعات.",
  BOOKING_WINDOW: "يفتح الحجز قبل موعد الحصة بـ48 ساعة.",
  MEMBERSHIP_REQUIRED: "تحتاج عضوية فعالة تشمل هذه الحصة وتغطي مدتها.",
  SUSPENDED: "حجز الحصص موقوف مؤقتاً لهذا الحساب.",
  DUPLICATE: "عندك حجز سابق لهذه الحصة.",
  OVERLAP: "يوجد تعارض في الوقت مع حجز أو موعد آخر.",
  CANCELLATION_CUTOFF: "يمكن الإلغاء قبل الحصة بساعتين على الأقل.",
  CLASS_CLOSED: "الحجز لهذه الحصة مغلق.",
  CLASS_STARTED: "بدأت الحصة ولا يمكن إلغاؤها.",
  CLASS_ENDED: "انتهت الحصة ولا يمكن إلغاؤها.",
  CHECKIN_WINDOW: "مسح QR وتسجيل الحضور متاح فقط من بداية الحصة حتى نهايتها.",
  INVALID_STATE: "لا يمكن تنفيذ العملية على حالة الحجز الحالية.",
  FORBIDDEN: "هذه العملية غير متاحة لحسابك.",
  REPLAY: "تم استخدام الرمز. انتظر ظهور الرمز الجديد.",
  EXPIRED_TOKEN:
    "انتهت صلاحية QR. افتح بطاقة الطالب أو حدّثها، ثم امسح الرمز الجديد.",
  INVALID_TOKEN: "الرمز غير صحيح.",
  REASON_REQUIRED: "اكتب سبباً واضحاً من 5 أحرف على الأقل.",
  NOT_FOUND: "لم يتم العثور على السجل المطلوب.",
  CSRF: "انتهت صلاحية الطلب. حدّث الصفحة وحاول مرة ثانية.",
  RATE_LIMIT: "طلبات كثيرة. انتظر دقيقة وحاول مجدداً.",
};
let session = null,
  view = "home",
  authMode = "local",
  classPage = 1,
  classFilter = "",
  listPage = 1,
  offset = 0,
  refreshTimer,
  passExpiresAt = 0,
  toastTimer,
  cameraStream,
  cameraFrame;
const now = () => Date.now() + offset;
const date = (time, options = {}) =>
  new Intl.DateTimeFormat("ar-JO", {
    timeZone: "Asia/Amman",
    month: "short",
    day: "numeric",
    ...options,
  }).format(new Date(time));
const time = (t) =>
  date(t, {
    month: undefined,
    day: undefined,
    hour: "numeric",
    minute: "2-digit",
  });
const money = (cents) =>
  (cents / 100).toLocaleString("ar-JO", { maximumFractionDigits: 2 }) + " د.أ";
const button = (text, action, id = "", style = "") =>
  `<button class="button ${style}" data-action="${action}" data-id="${escape(id)}">${text}</button>`;
const badge = (state) =>
  `<span class="badge ${state === "waitlisted" ? "warn" : ["no_show", "cancelled"].includes(state) ? "error" : "neutral"}">${escape(stateNames[state] || state)}</span>`;
function toast(message, error = false) {
  const t = document.querySelector("#toast");
  t.textContent = message;
  t.className = error ? "error" : "";
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), 6500);
}
async function api(path, options = {}) {
  const { headers = {}, ...rest } = options;
  const response = await fetch("/api" + path, {
    ...rest,
    headers: {
      "content-type": "application/json",
      ...(session ? { "x-csrf-token": session.csrf } : {}),
      ...headers,
    },
  });
  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error("تعذر قراءة استجابة الخادم. حاول مجدداً.");
  }
  if (!response.ok) {
    if (response.status === 401) {
      session = null;
      login();
    }
    const error = new Error(
      errors[data.error?.code] || data.error?.message || "تعذر إكمال الطلب.",
    );
    error.code = data.error?.code;
    throw error;
  }
  return data;
}
const post = (path, data = {}, headers = {}) =>
  api(path, { method: "POST", body: JSON.stringify(data), headers });
function login() {
  document.title =
    (location.pathname === "/register" ? "إنشاء حساب" : "تسجيل الدخول") +
    " | GymPassJUST";
  root.innerHTML = loginMarkup(
    location.pathname === "/register",
    authMode === "oidc",
  );
  window.scrollTo(0, 0);
}
function navItems() {
  const common = [["home", "", "الرئيسية"]];
  const byRole = {
    member: [
      ["classes", "", "جدول الحصص"],
      ["membership", "", "الاشتراكات"],
      ["bookings", "", "حجوزاتي"],
      ["pass", "", "بطاقة الاشتراك"],
      ["inbox", "", "الإشعارات"],
    ],
    instructor: [
      ["classes", "", "حصصي"],
      ["verify", "", "فحص QR وتسجيل الحضور"],
      ["publish", "", "نشر حصة جديدة"],
      ["inbox", "", "الإشعارات"],
    ],
    manager: [
      ["dashboard", "", "إحصائيات المركز"],
      ["classes", "", "جدول الحصص"],
      ["manage", "", "الحصص والباقات"],
      ["accounts", "", "إدارة الحسابات"],
      ["members", "", "الأعضاء"],
      ["audit", "", "سجل التدقيق"],
    ],
  };
  return common.concat(byRole[session.user.role] || []);
}
function shell() {
  root.innerHTML = shellMarkup(session, navItems(), roleNames);
}
function pagePath() {
  const prefix = {
    member: "student",
    instructor: "instructor",
    manager: "manager",
  }[session.user.role];
  return view === "account"
    ? "/account"
    : "/" + prefix + (view === "home" ? "" : "/" + view);
}
function locationView() {
  const candidate =
    location.pathname === "/account"
      ? "account"
      : location.pathname.split("/")[2] || "home";
  return [...navItems().map(([id]) => id), "account", "inbox"].includes(
    candidate,
  )
    ? candidate
    : "home";
}
async function enterApp() {
  session = await api("/bootstrap");
  offset = session.now - Date.now();
  view = locationView();
  shell();
  history.replaceState({}, "", pagePath());
  await render();
  window.scrollTo(0, 0);
}
window.addEventListener("popstate", () => {
  if (session) {
    view = locationView();
    render();
  } else login();
});

const heading = (title, subtitle, extra = "") =>
  `<header class="page-heading">
    <div>
    <h1>${title}</h1>
    <p>${subtitle}</p>
    </div>${extra}</header>`;
const empty = (title, text) =>
  `<div class="empty">
    <h2>${title}</h2>
    <p>${text}</p>
    </div>`;
const stat = (label, value, note) =>
  `<div class="stat">
    <small>${label}</small>
    <strong>${escape(value)}</strong>
    <small>${note}</small>
    </div>`;
function classCard(gymClass) {
  const isStudent = session.user.role === "member";
  const bookingOpen =
    gymClass.state === "published" &&
    now() >= gymClass.starts - 48 * 3600000 &&
    now() < gymClass.starts;
  const alreadyBooked = ["confirmed", "waitlisted", "checked_in"].includes(
    gymClass.myState,
  );
  let action = "";

  if (isStudent) {
    if (alreadyBooked) {
      action = badge(gymClass.myState);
    } else if (bookingOpen || gymClass.myState) {
      const label =
        gymClass.booked >= gymClass.capacity ? "انضم للانتظار" : "احجز مكانك";
      action = button(
        label,
        "book",
        gymClass.id,
        bookingOpen ? "small" : "small secondary",
      );
    }
  } else if (["manager", "instructor"].includes(session.user.role)) {
    action = button(
      "المسجلون والتفاصيل",
      "roster",
      gymClass.id,
      "small secondary",
    );
  }

  let status = "";
  if (gymClass.state === "cancelled") {
    status = '<span class="badge error">الحصة ملغاة</span>';
    action = "";
  } else if (!bookingOpen && isStudent) {
    let message = "بدأت الحصة";
    if (now() < gymClass.starts) {
      const opensAt = gymClass.starts - 48 * 3600000;
      message = "يفتح الحجز " + date(opensAt) + " " + time(opensAt);
    }
    status = "<small>" + message + "</small>";
  }

  const artLabels = {
    strength: "POWER",
    yoga: "FLOW",
    spinning: "RIDE",
    fitness: "MOVE",
  };
  const duration = Math.round((gymClass.ends - gymClass.starts) / 60000);
  const waiting = gymClass.waiting ? " · انتظار " + gymClass.waiting : "";
  return `<article class="class-card">
    <div class="class-art ${escape(gymClass.type)}" aria-hidden="true">
      <span class="art-label">${artLabels[gymClass.type]}</span>
    </div>
    <div class="class-info">
      <small>${date(gymClass.starts, { weekday: "long" })} · ${time(gymClass.starts)}</small>
      <h3>${escape(gymClass.title)}</h3>
      <div class="class-meta">
        <span>${escape(gymClass.instructor)}</span>
        <span>${escape(gymClass.studio)}</span>
        <span>${duration} دقيقة</span>
      </div>
      ${status}
      <div class="class-bottom">
        <small>${gymClass.booked} / ${gymClass.capacity} مقعد${waiting}</small>
        ${action}
      </div>
    </div>
  </article>`;
}
function pager(p, target) {
  if (p.totalPages <= 1) return "";
  return `<div class="pagination">${p.page > 1 ? button("السابق", target, p.page - 1, "secondary small") : ""}<span>صفحة ${p.page} من ${p.totalPages}</span>${p.page < p.totalPages ? button("التالي", target, p.page + 1, "secondary small") : ""}</div>`;
}
async function home() {
  return portalMarkup(session, navItems(), roleNames);
}
function publishView() {
  return (
    heading("نشر حصة جديدة", "حدد تفاصيل حصتك وموعدها للطلاب.") +
    classFormMarkup(session, typeNames)
  );
}
async function accountsView() {
  return accountsMarkup(await api("/accounts"), roleNames);
}
function accountView() {
  return accountMarkup(session, roleNames);
}

async function classesView() {
  const result = await api(
    "/classes?page=" + classPage + (classFilter ? "&type=" + classFilter : ""),
  );
  return (
    heading(
      session.user.role === "instructor" ? "حصصك" : "جدول الحصص",
      "كل المواعيد بتوقيت عمّان. الحجز متاح قبل الحصة بـ48 ساعة.",
      session.user.role === "instructor"
        ? '<button class="button" data-nav="publish">نشر حصة جديدة</button>'
        : "",
    ) +
    `<div class="filters">
    <div>
    <label for="class-type">نوع الحصة</label>
    <select id="class-type">
    <option value="">كل الأنواع</option>${Object.entries(typeNames)
      .map(
        ([key, label]) =>
          `<option value="${key}" ${key === classFilter ? "selected" : ""}>${label}</option>`,
      )
      .join("")}</select>
    </div>
    <div>
    <strong>الحجوزات</strong>
    <p class="muted">${result.pagination.totalItems} حصة ضمن الجدول</p>
    </div>
    </div>
    <h2 class="sr-only">الحصص المتاحة</h2>
    <section class="class-list">${result.data.map(classCard).join("")}</section>${result.data.length ? "" : empty("ما في حصص بهالتصنيف", "جرّب نوع حصة آخر.")}${pager(result.pagination, "class-page")}`
  );
}
async function bookingsView() {
  const rows = await api("/bookings");
  return (
    heading(
      "حجوزاتي",
      "الحضور يُسجّل بمسح QR عند المدرب أثناء الحصة. عدم المسح يُحسب غياباً بعد نهايتها.",
    ) +
    (rows.length
      ? `<div class="table-wrap">
    <table>
    <thead>
    <tr>
    <th>الحصة</th>
    <th>الموعد</th>
    <th>الحالة</th>
    <th>الإجراء</th>
    </tr>
    </thead>
    <tbody>${rows
      .map(
        (b) => `<tr>
    <td>${escape(b.title)}<br>
    <small>${escape(b.instructor)} · ${escape(b.studio)}</small>
    </td>
    <td>${date(b.starts)}<br>${time(b.starts)}</td>
    <td>${badge(b.state)}${b.position ? "<br>ترتيبك " + b.position : ""}</td>
    <td>${["confirmed", "waitlisted"].includes(b.state) && b.starts - now() >= 2 * 3600000 ? button("إلغاء الحجز", "cancel", b.id, "danger small") : "—"}</td>
    </tr>`,
      )
      .join("")}</tbody>
    </table>
    </div>`
      : empty("لسه ما عندك حجوزات", "روح لجدول الحصص واحجز أول تمرين."))
  );
}
async function membershipView() {
  const [plans, history] = await Promise.all([
    api("/plans"),
    api("/memberships"),
  ]);
  return (
    heading(
      "عضويتك بالمركز",
      "اختَر الباقة المناسبة. الدفع في نسخة المشروع محاكاة فقط.",
    ) +
    '<section class="plans">' +
    plans
      .map((p) => {
        const subscribed = history.some(
          (m) => m.plan_id === p.id && m.ends > now(),
        );
        return `<article class="plan ${subscribed ? "subscribed-plan" : ""}">
    <small>${p.days} يوم</small>
    <h2>${escape(p.name)}</h2>
    <div class="price">${money(p.price)}</div>
    <ul class="check-list">${p.types.map((t) => "<li>" + typeNames[t] + "</li>").join("")}</ul>${subscribed ? '<span class="badge neutral">مشترك فيها</span><button class="button" disabled>مشترك بالفعل</button>' : button("اختيار الباقة", "purchase", p.id)}</article>`;
      })
      .join("") +
    '</section><section class="panel"><h2>سجل العضويات</h2>' +
    history
      .map(
        (m) =>
          "<p><strong>" +
          escape(m.name) +
          "</strong> — " +
          date(m.starts) +
          " — " +
          date(m.ends, { year: "numeric" }) +
          "</p>",
      )
      .join("") +
    "</section>"
  );
}
async function passView() {
  const p = await api("/membership-pass");
  passExpiresAt = p.expiresAt;
  return (
    heading(
      "بطاقة الاشتراك",
      "اعرض الرمز للمدرب عند باب الحصة للتحقق من اشتراكك وتسجيل حضورك.",
    ) +
    `<div class="qr-layout">
    <section class="pass">
    <div class="brand">
    <img src="/just-logo.png" alt="">
    <strong>GymPassJUST</strong>
    </div>
    <h2>${escape(session.user.name)}</h2>
    <img class="qr" src="${p.image}" alt="رمز QR للتحقق من الاشتراك">
    <strong>${session.membership ? "اشتراك فعّال" : "لا يوجد اشتراك فعّال"}</strong>
    <p>
    <small>يتجدد الرمز تلقائياً كل 30 ثانية، وصلاحيته دقيقتان.</small>
    </p>
    </section>
    <section class="panel">
    <h2>التحقق عند الباب</h2>
    <p>المدرب يختار الحصة ويفحص الرمز. يتم تسجيل حضورك فقط إذا اشتراكك فعّال وحجزك مؤكد بالحصة.</p>
    <label for="pass-token">نسخ الرمز للتحقق اليدوي</label>
    <textarea id="pass-token" class="token-field" rows="4" readonly>${p.token}</textarea>
    <div class="form-actions">${button("نسخ الرمز", "copy-token", "", "secondary")}${button("تحديث البطاقة", "refresh", "", "secondary")}</div>
    </section>
    </div>`
  );
}
async function verifyView() {
  const result = await api("/classes"),
    classes = result.data.filter(
      (c) => c.state === "published" && c.ends > now(),
    );
  const current = classes.find((c) => c.starts <= now() && c.ends > now())?.id;
  return (
    heading(
      "فحص QR وتسجيل الحضور",
      "اختَر حصتك ثم امسح QR الطالب أثناء وقت الحصة.",
    ) +
    `<section class="panel">
    <h2>فحص بطاقة الطالب</h2>
    <p>لا يُقبل المسح بدون اشتراك فعّال وحجز مؤكد في الحصة المختارة.</p>${
      classes.length
        ? `<form id="verify-form">
    <label for="verify-class">الحصة المختارة</label>
    <select id="verify-class" name="classId" required>${classes.map((c) => `<option value="${c.id}" ${c.id === current ? "selected" : ""}>${escape(c.title)} — ${date(c.starts)} ${time(c.starts)}</option>`).join("")}</select>
    <label for="verify-token">رمز بطاقة الطالب</label>
    <textarea id="verify-token" name="token" dir="ltr" rows="4" required placeholder="الصق الرمز أو استخدم الكاميرا"></textarea>
    <div class="form-actions">
    <button class="button" type="submit">فحص وتسجيل الحضور</button>${button("فتح الكاميرا", "camera", "", "secondary")}</div>
    </form>`
        : empty(
            "لا توجد حصص قادمة",
            "انشر حصة أولاً. المسح متاح من بداية الحصة حتى نهايتها.",
          )
    }<video id="camera" autoplay playsinline hidden>
    </video>
    <div id="verify-result" role="status" aria-live="polite">
    </div>
    </section>`
  );
}
async function inboxView() {
  const rows = await api("/notifications?page=" + listPage);
  return (
    heading(
      "الإشعارات",
      "تأكيدات الحجز، ترقية الانتظار، وتذكيرات العضوية.",
      button("تحديد الكل كمقروء", "read", "", "secondary"),
    ) +
    (rows.data.length
      ? `<section class="panel">${rows.data
          .map(
            (n) => `<article class="activity">
    <span class="activity-dot" aria-hidden="true">
    </span>
    <div>
    <p>${escape(n.message)}</p>
    <small>${date(n.created)} · ${time(n.created)} ${n.read_at ? "" : "· جديد"}</small>
    </div>
    </article>`,
          )
          .join("")}</section>${pager(rows.pagination, "list-page")}`
      : empty(
          "ما في إشعارات حالياً",
          "أي تحديث على حجزك أو عضويتك رح يظهر هون.",
        ))
  );
}
async function dashboard() {
  const d = await api("/dashboard");
  const weekly = d.weekly
    .map((w) => {
      const cap =
        d.capacityByWeek.find((c) => c.week === w.week && c.type === w.type)
          ?.capacity || 0;
      return `<tr>
    <td>
    <bdi>${escape(w.week)}</bdi>
    </td>
    <td>${typeNames[w.type]}</td>
    <td>${w.classes}</td>
    <td>${cap ? Math.round((w.allocated / cap) * 100) : 0}%</td>
    </tr>`;
    })
    .join("");
  return (
    heading(
      "المركز بنظرة واحدة",
      "مؤشرات العضوية والحجز من بيانات النظام الحالية.",
    ) +
    `<section class="stats">${stat("الأعضاء الفعالون", d.activeMembers, "عضويات صالحة الآن")}${stat("الحجوزات القادمة", d.confirmed, "حجز مؤكد")}${stat("بانتظار مكان", d.waitlisted, "طلب على قوائم الانتظار")}</section>
    <section class="split">
    <div class="panel">
    <h2>إشغال الحصص</h2>
    <div class="table-wrap">
    <table>
    <thead>
    <tr>
    <th>الأسبوع</th>
    <th>النوع</th>
    <th>الحصص</th>
    <th>الإشغال</th>
    </tr>
    </thead>
    <tbody>${weekly}</tbody>
    </table>
    </div>
    </div>
    <div class="panel">
    <h2>العضويات حسب الباقة</h2>
    <div class="bar-chart">${d.activeByPlan
      .map(
        (p) => `<div class="bar-row">
    <span>${escape(p.name)}</span>
    <meter min="0" max="${Math.max(1, d.activeMembers)}" value="${p.count}" aria-label="${escape(p.name)}">
    </meter>
    <strong>${p.count}</strong>
    </div>`,
      )
      .join("")}</div>
    </div>
    </section>`
  );
}
async function members() {
  return (
    heading("الأعضاء", "افحص عضويات الطلاب وسجّل اشتراكاً تجريبياً.") +
    `<form id="member-search" class="filters">
    <div>
    <label for="member-query">اسم العضو أو البريد أو المعرّف</label>
    <input id="member-query" name="q" placeholder="مثال: member-1">
    </div>
    <button class="button">بحث</button>
    </form>
    <div id="member-results">${empty("ابحث عن عضو", "النتائج تعرض البيانات اللازمة للاستقبال فقط.")}</div>`
  );
}
async function manage() {
  const plans = await api("/plans");
  return (
    heading("إدارة المركز", "انشر حصة جديدة أو أضف باقة عضوية.") +
    `<div class="split">${classFormMarkup(session, typeNames)}<section class="panel">
    <h2>إضافة باقة</h2>
    <form id="plan-form">
    <label for="plan-name">اسم الباقة</label>
    <input id="plan-name" name="name" required maxlength="100">
    <label for="price">السعر بالدينار الأردني</label>
    <input id="price" name="price" type="number" min="0" step="0.01" required>
    <label for="days">المدة بالأيام</label>
    <input id="days" name="days" type="number" min="1" max="366" required>
    <fieldset>
    <legend>الحصص المشمولة</legend>${Object.entries(typeNames)
      .map(
        ([key, label]) =>
          `<label>
    <input class="type-checkbox" type="checkbox" name="types" value="${key}" checked> ${label}</label>`,
      )
      .join("")}</fieldset>
    <div class="form-actions">
    <button class="button">إضافة الباقة</button>
    </div>
    </form>
    <p class="footnote">الباقات الحالية: ${plans.map((p) => escape(p.name)).join("، ")}</p>
    </section>
    </div>`
  );
}
async function auditView() {
  const r = await api("/audit?page=" + listPage);
  return (
    heading("سجل التدقيق", "تغييرات العضوية والجدول وسجل قرارات الإدارة.") +
    (r.data.length
      ? `<div class="table-wrap">
    <table>
    <thead>
    <tr>
    <th>الوقت</th>
    <th>الفاعل</th>
    <th>العملية</th>
    <th>السجل</th>
    <th>التفاصيل</th>
    </tr>
    </thead>
    <tbody>${r.data
      .map(
        (a) => `<tr>
    <td>${date(a.created)}<br>${time(a.created)}</td>
    <td>
    <bdi>${escape(a.actor)}</bdi>
    </td>
    <td>
    <bdi>${escape(a.action)}</bdi>
    </td>
    <td>
    <bdi>${escape(a.target)}</bdi>
    </td>
    <td>${escape(a.detail)}</td>
    </tr>`,
      )
      .join("")}</tbody>
    </table>
    </div>${pager(r.pagination, "list-page")}`
      : empty("السجل فارغ", "ستظهر هنا العمليات التي يجريها المستخدمون."))
  );
}
const views = {
  home,
  classes: classesView,
  bookings: bookingsView,
  pass: passView,
  verify: verifyView,
  membership: membershipView,
  inbox: inboxView,
  dashboard,
  members,
  manage,
  audit: auditView,
  publish: publishView,
  accounts: accountsView,
  account: accountView,
};
let renderSerial = 0;
async function render(moveFocus = false) {
  if (!session) return;
  const serial = ++renderSerial;
  if (moveFocus) history.pushState({}, "", pagePath());
  const title =
    navItems().find(([id]) => id === view)?.[2] ||
    (view === "account" ? "حسابي" : "الإشعارات");
  document.querySelector("#page-title").textContent = title;
  document.title = title + " | GymPassJUST";
  stopCamera();
  clearTimeout(refreshTimer);
  const main = document.querySelector("#main");
  main.setAttribute("aria-busy", "true");
  document.querySelectorAll("[data-nav]").forEach((n) => {
    n.classList.toggle("active", n.dataset.nav === view);
    if (n.dataset.nav === view) n.setAttribute("aria-current", "page");
    else n.removeAttribute("aria-current");
  });
  try {
    const html = await (views[view] || home)();
    if (serial !== renderSerial) return;
    main.innerHTML = html;
    main.removeAttribute("aria-busy");
    if (moveFocus) main.focus();
    if (view === "pass" || view === "classes")
      refreshTimer = setTimeout(
        () => render(),
        view === "pass"
          ? Math.max(1000, Math.min(30000, passExpiresAt - now() - 30000))
          : 60000,
      );
  } catch (e) {
    main.removeAttribute("aria-busy");
    main.innerHTML =
      empty("تعذر تحميل الصفحة", escape(e.message)) +
      button("حاول مجدداً", "refresh");
  }
}
function showModal(html) {
  modalBody.innerHTML = html;
  modal.showModal();
}
async function refreshSession() {
  session = await api("/bootstrap");
  offset = session.now - Date.now();
  document.querySelector("#unread").textContent = session.unread || "";
}
async function roster(id) {
  const [rows, c] = await Promise.all([
    api(`/classes/${id}/roster`),
    api(`/classes/${id}`),
  ]);
  showModal(
    `<h2>المسجلون في الحصة</h2>${c.state === "published" && c.ends > now() ? button("إلغاء الحصة", "cancel-class", id, "danger") : badge(c.state === "cancelled" ? "cancelled" : "attended")}${rows.length ? '<div class="table-wrap"><table><thead><tr><th>الاسم</th><th>البريد الإلكتروني</th><th>الحالة</th></tr></thead><tbody>' + rows.map((b) => "<tr><td>" + escape(b.name) + "</td><td><bdi>" + escape(b.email) + "</bdi></td><td>" + badge(b.state) + "</td></tr>").join("") + "</tbody></table></div>" : empty("لا توجد حجوزات", "لم يسجل أعضاء في هذه الحصة.")}`,
  );
}
async function purchase(planId, userId) {
  const plans = await api("/plans"),
    plan = plans.find((p) => p.id === Number(planId));
  showModal(
    `<h2>تأكيد الاشتراك</h2>
    <p>${escape(plan.name)} — ${money(plan.price)} لمدة ${plan.days} يوم.</p>
    <div class="notice">عملية تجريبية فقط. لا يتم خصم أي مبلغ.</div>
    <button class="button" data-action="confirm-purchase" data-id="${plan.id}" data-user="${escape(userId || "")}" data-key="${crypto.randomUUID()}">تأكيد الدفع التجريبي</button>`,
  );
}
async function memberSearch(query, p = 1) {
  const r = await api("/members?q=" + encodeURIComponent(query) + "&page=" + p),
    target = document.querySelector("#member-results");
  target.dataset.query = query;
  target.innerHTML = r.data.length
    ? '<div class="table-wrap"><table><thead><tr><th>الاسم</th><th>البريد الإلكتروني</th><th>العضوية</th></tr></thead><tbody>' +
      r.data
        .map(
          (u) =>
            "<tr><td>" +
            escape(u.name) +
            "</td><td><bdi>" +
            escape(u.email) +
            "</bdi></td><td>" +
            (u.membership
              ? "فعالة حتى " + date(u.membership.ends)
              : "غير فعالة") +
            "</td></tr>",
        )
        .join("") +
      "</tbody></table></div>" +
      pager(r.pagination, "member-page")
    : empty("لا توجد نتائج", "جرّب اسم أو بريد آخر.");
}
root.addEventListener("change", (e) => {
  if (e.target.id === "class-type") {
    classFilter = e.target.value;
    classPage = 1;
    render();
  }
});
document.addEventListener("click", async (e) => {
  const authLink = e.target.closest("[data-auth]");
  if (authLink) {
    e.preventDefault();
    history.pushState({}, "", authLink.href);
    login();
    return;
  }
  const nav = e.target.closest("[data-nav]");
  if (nav) {
    document.querySelector("#menu-panel")?.close();
    view = nav.dataset.nav;
    listPage = 1;
    await render(true);
    return;
  }
  const target = e.target.closest("[data-action]");
  if (!target) return;
  const action = target.dataset.action,
    id = target.dataset.id;
  target.disabled = true;
  try {
    if (action === "open-menu")
      document.querySelector("#menu-panel").showModal();
    else if (action === "close-menu")
      document.querySelector("#menu-panel").close();
    else if (action === "toggle-password") {
      const input = document.querySelector("#auth-password");
      input.type = input.type === "password" ? "text" : "password";
      target.textContent = input.type === "password" ? "إظهار" : "إخفاء";
    } else if (action === "logout") {
      await post("/logout");
      session = null;
      clearTimeout(refreshTimer);
      history.replaceState({}, "", "/login");
      login();
    } else if (action === "book") {
      await post("/bookings", { classId: Number(id) });
      toast("تم تسجيل طلبك. حالة الحجز ظاهرة على الحصة.");
      await refreshSession();
      await render();
    } else if (action === "cancel") {
      showModal(
        `<h2>إلغاء الحجز</h2>
    <p>المقعد رح ينتقل لأول عضو مؤهل بقائمة الانتظار.</p>${button("تأكيد الإلغاء", "confirm-cancel", id, "danger")}`,
      );
    } else if (action === "confirm-cancel") {
      await post(`/bookings/${id}/cancellation`);
      modal.close();
      toast("تم إلغاء الحجز.");
      await render();
    } else if (action === "purchase") await purchase(id);
    else if (action === "confirm-purchase") {
      await post(
        "/memberships",
        {
          planId: Number(id),
          ...(target.dataset.user ? { userId: target.dataset.user } : {}),
        },
        { "Idempotency-Key": target.dataset.key },
      );
      modal.close();
      toast("تم الاشتراك التجريبي بنجاح.");
      await refreshSession();
      await render();
    } else if (action === "class-page") {
      classPage = Number(id);
      await render(true);
    } else if (action === "list-page") {
      listPage = Number(id);
      await render(true);
    } else if (action === "member-page")
      await memberSearch(
        document.querySelector("#member-results").dataset.query,
        Number(id),
      );
    else if (action === "read") {
      await post("/notifications/read");
      await refreshSession();
      await render();
    } else if (action === "refresh") await render();
    else if (action === "copy-token") {
      await navigator.clipboard.writeText(
        document.querySelector("#pass-token").value,
      );
      toast("تم نسخ الرمز.");
    } else if (action === "roster") await roster(id);
    else if (action === "cancel-class") {
      modalBody.innerHTML = `<h2>تأكيد إلغاء الحصة</h2>
    <p>سيتم إلغاء الحجوزات وإشعار جميع المسجلين.</p>${button("تأكيد إلغاء الحصة", "confirm-class-cancel", id, "danger")}`;
    } else if (action === "confirm-class-cancel") {
      await post(`/classes/${id}/cancellation`);
      modal.close();
      toast("أُلغيت الحصة وأُرسلت الإشعارات.");
      await render();
    } else if (action === "camera") await startCamera();
    else if (action === "camera-stop") stopCamera();
  } catch (error) {
    toast(error.message, true);
  } finally {
    if (target.isConnected) target.disabled = false;
  }
});
document.addEventListener("submit", async (e) => {
  const form = e.target;
  if (
    ![
      "login-form",
      "register-form",
      "account-form",
      "password-form",
      "verify-form",
      "member-search",
      "class-form",
      "plan-form",
    ].includes(form.id)
  )
    return;
  e.preventDefault();
  const submit = form.querySelector('button[type="submit"],button:not([type])');
  if (submit) submit.disabled = true;
  const data = Object.fromEntries(new FormData(form));
  try {
    if (["login-form", "register-form"].includes(form.id)) {
      if (form.id === "register-form" && data.password !== data.confirmPassword)
        throw new Error("كلمتا المرور غير متطابقتين.");
      const response = await fetch(
        "/auth/local/" + (form.id === "register-form" ? "register" : "login"),
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(data),
        },
      );
      const result = await response.json();
      if (!response.ok)
        throw new Error(
          errors[result.error?.code] || "تعذر تسجيل الدخول. حاول مرة أخرى.",
        );
      await enterApp();
      return;
    }
    if (form.id === "password-form") {
      if (data.password !== data.confirmPassword)
        throw new Error("كلمتا المرور غير متطابقتين.");
      await post("/account/password", data);
      await refreshSession();
      form.reset();
      toast("تم تغيير كلمة المرور وإنهاء الجلسات الأخرى.");
    }
    if (form.id === "account-form") {
      await post("/accounts", data);
      toast("تم إنشاء الحساب. سلّم بيانات الدخول لصاحبه.");
      await render();
    }
    if (form.id === "verify-form") {
      stopCamera();
      document.querySelector("#verify-result").innerHTML =
        "<p>جارٍ فحص QR وتسجيل الحضور…</p>";
      const r = await post("/class-qr-check-ins", {
        ...data,
        classId: Number(data.classId),
      });
      document.querySelector("#verify-result").innerHTML =
        `<div class="notice ${r.allowed ? "" : "error"}">
    <h2>${escape(r.message)}</h2>
    <strong>${escape(r.member.name)}</strong>
    <p>
    <bdi>${escape(r.member.email)}</bdi>
    </p>${[r.membership].map((m) => "<p>" + escape(m.name) + " — صالحة حتى " + date(m.ends, { year: "numeric" }) + "</p>").join("")}</div>`;
      form.reset();
      form.elements.classId.value = data.classId;
    }
    if (form.id === "member-search") await memberSearch(data.q);
    if (form.id === "class-form") {
      await post("/classes", {
        ...data,
        starts: Date.parse(data.starts + ":00+03:00"),
        ends: Date.parse(data.ends + ":00+03:00"),
        capacity: Number(data.capacity),
      });
      form.reset();
      toast("تم نشر الحصة وظهرت في جدول الطلاب.");
      if (session.user.role === "instructor") {
        view = "classes";
        await render(true);
      }
    }
    if (form.id === "plan-form") {
      await post("/plans", {
        ...data,
        price: Math.round(Number(data.price) * 100),
        days: Number(data.days),
        types: new FormData(form).getAll("types"),
      });
      toast("تمت إضافة الباقة.");
      await render();
    }
  } catch (error) {
    if (form.id === "verify-form")
      document.querySelector("#verify-result").innerHTML =
        '<div class="notice error">' + escape(error.message) + "</div>";
    const inline = form.querySelector("#auth-error, #class-error");
    if (inline) {
      inline.textContent = error.message;
      inline.hidden = false;
    } else toast(error.message, true);
  } finally {
    if (submit?.isConnected) submit.disabled = false;
  }
});
function stopCamera() {
  const video = document.querySelector("#camera");
  if (video) video.hidden = true;
  cancelAnimationFrame(cameraFrame);
  cameraStream?.getTracks().forEach((t) => t.stop());
  cameraStream = null;
}
async function startCamera() {
  if (!navigator.mediaDevices?.getUserMedia) {
    toast("الكاميرا تحتاج متصفحاً يدعمها واتصال HTTPS أو localhost.", true);
    return;
  }
  stopCamera();
  cameraStream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: "environment" },
  });
  const video = document.querySelector("#camera");
  video.hidden = false;
  video.srcObject = cameraStream;
  const native =
    "BarcodeDetector" in window
      ? new BarcodeDetector({ formats: ["qr_code"] })
      : null;
  const canvas = document.createElement("canvas"),
    context = canvas.getContext("2d", { willReadFrequently: true });
  let lastScan = 0;
  async function scan(stamp) {
    if (!cameraStream) return;
    if (video.readyState >= 2 && stamp - lastScan > 140) {
      lastScan = stamp;
      let token;
      if (native)
        try {
          token = (await native.detect(video))[0]?.rawValue;
        } catch {}
      if (!token && window.jsQR) {
        canvas.width = Math.min(video.videoWidth, 720);
        canvas.height = Math.round(
          (video.videoHeight * canvas.width) / video.videoWidth,
        );
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
        token = window.jsQR(pixels.data, pixels.width, pixels.height, {
          inversionAttempts: "dontInvert",
        })?.data;
      }
      if (token) {
        document.querySelector("#verify-token").value = token;
        stopCamera();
        document.querySelector("#verify-form").requestSubmit();
        return;
      }
    }
    if (cameraStream) cameraFrame = requestAnimationFrame(scan);
  }
  video.onloadeddata = () => {
    cameraFrame = requestAnimationFrame(scan);
  };
}
root.addEventListener("input", (e) => {
  if (["verify-token", "verify-class"].includes(e.target.id)) {
    const result = document.querySelector("#verify-result");
    if (result) result.innerHTML = "";
  }
});
window.addEventListener("pagehide", stopCamera);
// Browsers throttle background timers. Refresh a displayed pass on returning.
document.addEventListener("visibilitychange", () => {
  if (!document.hidden && session && ["pass", "classes"].includes(view))
    render();
});
try {
  const config = await (await fetch("/auth/config")).json();
  authMode = config.mode;
  await enterApp();
} catch (error) {
  if (!session) login();
  else toast(error.message, true);
}
