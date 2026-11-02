// UI copy is authored in Arabic. Keep original text nodes so switching language
// never changes input values, account details, user-authored content or API data.
const pairs = [
  [
    "يتجدد الرمز تلقائياً كل 30 ثانية، وصلاحيته دقيقتان.",
    "The code refreshes every 30 seconds and is valid for two minutes.",
  ],
  [
    "انتهت صلاحية QR. افتح بطاقة الطالب أو حدّثها، ثم امسح الرمز الجديد.",
    "This QR code expired. Open or refresh the student's pass, then scan the new code.",
  ],
  [
    "انتهت الحصة ولا يمكن إلغاؤها.",
    "This class has ended and cannot be cancelled.",
  ],
  [
    "جامعة العلوم والتكنولوجيا الأردنية",
    "Jordan University of Science and Technology",
  ],
  ["شعار جامعة العلوم والتكنولوجيا الأردنية", "JUST university logo"],
  ["المركز الرياضي الجامعي", "University Sports Center"],
  [
    "المركز الرياضي · جامعة العلوم والتكنولوجيا الأردنية",
    "Sports Center · Jordan University of Science and Technology",
  ],
  [
    "مشروع المركز الرياضي الجامعي. الحسابات مستقلة عن أنظمة الجامعة الرسمية.",
    "University sports center project. Accounts are separate from official university systems.",
  ],
  ["المركز الرياضي", "Sports Center"],
  ["انتقل للمحتوى", "Skip to content"],
  ["إنشاء حساب طالب", "Create a student account"],
  ["تسجيل الدخول", "Sign in"],
  ["إنشاء حساب", "Create an account"],
  ["إنشاء الحساب", "Create account"],
  ["الاسم الكامل", "Full name"],
  ["البريد الإلكتروني", "Email address"],
  ["كلمة المرور الأولية", "Initial password"],
  ["كلمة المرور الحالية", "Current password"],
  ["كلمة المرور الجديدة", "New password"],
  ["تأكيد الكلمة الجديدة", "Confirm new password"],
  ["تأكيد كلمة المرور", "Confirm password"],
  ["إظهار كلمة المرور", "Show password"],
  ["كلمة المرور", "Password"],
  [
    "12 حرفاً على الأقل. استخدم كلمة مرور خاصة بالمشروع.",
    "At least 12 characters. Use a password unique to this project.",
  ],
  [
    "12 حرفاً على الأقل. سيتم إنهاء جلسات الدخول الأخرى.",
    "At least 12 characters. Other signed-in sessions will be ended.",
  ],
  ["طالب جديد؟", "New student?"],
  ["عندك حساب؟", "Already have an account?"],
  ["الدخول بالحساب الجامعي", "Sign in with university account"],
  ["دخول", "Sign in"],
  ["إظهار", "Show"],
  ["إخفاء", "Hide"],
  ["إغلاق", "Close"],
  ["الرئيسية", "Home"],
  ["صفحات النظام", "System pages"],
  ["التنقل السريع", "Quick navigation"],
  ["القائمة الجانبية", "Account menu"],
  ["فتح القائمة", "Open menu"],
  ["إغلاق القائمة", "Close menu"],
  ["جدول الحصص", "Class schedule"],
  ["حصصي والحضور", "My classes & attendance"],
  ["حصصك والحضور", "My classes & attendance"],
  ["نشر حصة جديدة", "Publish a class"],
  ["نشر حصة وموعدها", "Publish a class & time"],
  [
    "حدد تفاصيل حصتك وموعدها للطلاب.",
    "Set the class details and time for students.",
  ],
  [
    "تظهر الحصة للطلاب مباشرة بعد نشرها. كل المواعيد بتوقيت عمّان.",
    "Students can see the class immediately after publication. All times are in Amman time.",
  ],
  ["نشر الحصة", "Publish class"],
  ["اسم الحصة", "Class name"],
  ["نوع الحصة", "Class type"],
  ["التاريخ ووقت البداية", "Start date & time"],
  ["التاريخ ووقت النهاية", "End date & time"],
  ["البداية بتوقيت عمّان", "Start (Amman time)"],
  ["النهاية بتوقيت عمّان", "End (Amman time)"],
  ["عدد المقاعد", "Number of seats"],
  ["القاعة", "Room"],
  ["الاستوديو", "Studio"],
  ["المدرب", "Instructor"],
  [
    "كل المواعيد بتوقيت عمّان. الحجز متاح قبل الحصة بـ48 ساعة.",
    "All times are in Amman time. Booking opens 48 hours before each class.",
  ],
  ["كل الأنواع", "All types"],
  ["الحجوزات", "Bookings"],
  ["الحصص المتاحة", "Available classes"],
  ["ما في حصص بهالتصنيف", "No classes in this category"],
  ["جرّب نوع حصة آخر.", "Try another class type."],
  ["احجز مكانك", "Book a place"],
  ["انضم للانتظار", "Join waitlist"],
  ["الحضور والتفاصيل", "Attendance & details"],
  ["الحصة ملغاة", "Class cancelled"],
  ["بدأت الحصة", "Class has started"],
  ["يفتح الحجز", "Booking opens"],
  ["قوة وتحمل", "Strength & endurance"],
  ["يوغا وتوازن", "Yoga & balance"],
  ["دراجات داخلية", "Indoor cycling"],
  ["لياقة بدنية", "Fitness training"],
  ["يوغا", "Yoga"],
  ["دراجات", "Cycling"],
  ["لياقة", "Fitness"],
  ["مؤكد", "Confirmed"],
  ["قائمة الانتظار", "Waitlisted"],
  ["ملغى", "Cancelled"],
  ["تم تسجيل الحضور", "Checked in"],
  ["حضر", "Attended"],
  ["غياب", "No-show"],
  ["انتهى الانتظار", "Waitlist ended"],
  ["السابق", "Previous"],
  ["التالي", "Next"],
  ["حجوزاتي وسجل الحضور", "My bookings & attendance"],
  [
    "تابع حجوزاتك المؤكدة وقوائم الانتظار والحصص السابقة.",
    "View confirmed bookings, waiting lists and past classes.",
  ],
  ["سجل نشاطك", "Activity history"],
  ["حجوزاتي", "My bookings"],
  ["الحصة", "Class"],
  ["الموعد", "Date & time"],
  ["الحالة", "Status"],
  ["الإجراء", "Action"],
  ["إلغاء الحجز", "Cancel booking"],
  ["تأكيد الإلغاء", "Confirm cancellation"],
  ["لسه ما عندك حجوزات", "No bookings yet"],
  [
    "روح لجدول الحصص واحجز أول تمرين.",
    "Visit the class schedule to book your first session.",
  ],
  ["تسجيل حضور برمز الاستوديو", "Check in with a studio code"],
  ["الرمز المعروض عند المدرب", "Code displayed by the instructor"],
  ["تسجيل الحضور", "Check in"],
  ["تسجيل حضور", "Check in"],
  ["الحضور", "Attendance"],
  ["عضويتك بالمركز", "My membership"],
  ["الاشتراكات", "Memberships"],
  ["العضوية", "Membership"],
  [
    "اختَر الباقة المناسبة. الدفع في نسخة المشروع محاكاة فقط.",
    "Choose a plan. Payments in this project are simulated.",
  ],
  [
    "ما عندك عضوية فعالة حالياً. فعّل باقة عشان تحجز وتدخل المركز.",
    "No active membership. Activate a plan to book classes and enter the center.",
  ],
  [
    "تجديد الباقة نفسها يبدأ بعد انتهاء اشتراكك الحالي.",
    "Renewing the same plan extends it after your current membership ends.",
  ],
  ["بطاقة دخول رقمية", "Digital entry pass"],
  ["اختيار الباقة", "Choose plan"],
  ["سجل العضويات", "Membership history"],
  ["لا توجد عضويات سابقة.", "No previous memberships."],
  ["الاشتراك الشهري", "Monthly membership"],
  ["اشتراك الفصل الدراسي", "Semester membership"],
  ["باقة اليوغا", "Yoga plan"],
  ["عضوية فعالة", "Active membership"],
  ["عضوية غير فعالة", "Inactive membership"],
  ["عضويتك فعالة", "Your membership is active"],
  ["بطاقة الدخول", "Entry pass"],
  ["عرض بطاقة الدخول", "Show entry pass"],
  ["بطاقة دخول المركز الرياضي", "Sports center entry pass"],
  [
    "قرّب الرمز من قارئ بوابة المركز. يتجدد تلقائياً كل دقيقة.",
    "Show this code at the gate. It refreshes automatically every minute.",
  ],
  ["رمز QR لبطاقة الدخول الحالية", "QR code for the current entry pass"],
  ["جاهز للتمرين؟", "Ready to train?"],
  [
    "حضّر بطاقتك عند البوابة. كل رمز يُستخدم مرة واحدة، وبعدها انتظر الرمز التالي.",
    "Have your pass ready at the gate. Each code works once; then wait for the next code.",
  ],
  [
    "عضويتك منتهية أو غير فعالة. جدّدها قبل الدخول.",
    "Your membership is expired or inactive. Renew it before entering.",
  ],
  ["نسخ الرمز لمحاكاة البوابة", "Copy code for the simulated gate"],
  ["نسخ الرمز", "Copy code"],
  ["تحديث البطاقة", "Refresh pass"],
  ["الإشعارات", "Notifications"],
  [
    "تأكيدات الحجز، ترقية الانتظار، وتذكيرات العضوية.",
    "Booking confirmations, waitlist promotions and membership reminders.",
  ],
  ["تحديد الكل كمقروء", "Mark all as read"],
  ["ما في إشعارات حالياً", "No notifications yet"],
  [
    "أي تحديث على حجزك أو عضويتك رح يظهر هون.",
    "Booking and membership updates will appear here.",
  ],
  ["إحصائيات المركز", "Center statistics"],
  ["المركز بنظرة واحدة", "Center overview"],
  [
    "مؤشرات العضوية والحجز والحضور من بيانات النظام الحالية.",
    "Membership, booking and attendance figures from current records.",
  ],
  ["الأعضاء الفعالون", "Active members"],
  ["عضويات صالحة الآن", "Memberships valid now"],
  ["الحجوزات القادمة", "Upcoming bookings"],
  ["حجز مؤكد", "Confirmed bookings"],
  ["بانتظار مكان", "Waiting for a place"],
  ["طلب على قوائم الانتظار", "Waitlist requests"],
  ["دخول آخر 24 ساعة", "Entries in the last 24 hours"],
  ["دخول مسموح", "Allowed entries"],
  ["إشغال الحصص والغياب", "Class occupancy & no-shows"],
  ["الأسبوع", "Week"],
  ["النوع", "Type"],
  ["الحصص", "Classes"],
  ["حصصي", "My classes"],
  ["الإشغال", "Occupancy"],
  ["الغياب", "No-shows"],
  ["العضويات حسب الباقة", "Memberships by plan"],
  ["الدخول حسب الساعة", "Entries by hour"],
  [
    "لم تُسجل عمليات دخول خلال آخر أسبوع.",
    "No gate entries were recorded in the last week.",
  ],
  ["بوابة الدخول", "Entry gate"],
  ["تسجيل الدخول للمركز", "Center check-in"],
  [
    "افحص بطاقة العضو قبل السماح بالدخول للمركز.",
    "Check the member's pass before allowing entry.",
  ],
  ["فحص بطاقة QR", "Check a QR pass"],
  ["رمز بطاقة العضو", "Member pass code"],
  ["الصق الرمز أو استخدم الكاميرا", "Paste a code or use the camera"],
  ["فحص الدخول", "Check entry"],
  ["فتح الكاميرا", "Open camera"],
  ["إرشادات الاستقبال", "Gate instructions"],
  [
    "الرمز صالح لدقيقة واحدة ويُستخدم مرة واحدة. فحص البوابة يتحقق من صلاحية العضوية في لحظة المسح.",
    "A code is valid for one minute and one use. The gate checks membership at scan time.",
  ],
  [
    "إيقاف حجز الحصص لا يمنع دخول المركز إذا كانت العضوية فعالة.",
    "A booking suspension does not block entry when the membership is active.",
  ],
  ["البحث عن عضو", "Find a member"],
  ["الأعضاء", "Members"],
  ["التحقق من العضوية", "Verify membership"],
  [
    "افحص العضوية، سجّل تجديداً تجريبياً، أو راجع إيقاف الحجز.",
    "Check membership, record a simulated renewal or review a booking suspension.",
  ],
  ["اسم العضو أو البريد أو المعرّف", "Member name, email or ID"],
  ["مثال: member-1", "Example: member-1"],
  ["بحث", "Search"],
  ["ابحث عن عضو", "Search for a member"],
  [
    "النتائج تعرض البيانات اللازمة للاستقبال فقط.",
    "Results show the information needed by center staff.",
  ],
  ["التحقق فقط", "Verification only"],
  ["شراء عضوية", "Buy membership"],
  ["رفع الإيقاف", "Lift suspension"],
  ["حالة الحجز", "Booking status"],
  ["موقوف", "Suspended"],
  ["متاح", "Available"],
  ["غير فعالة", "Inactive"],
  ["لا توجد نتائج", "No results"],
  ["جرّب اسم أو بريد آخر.", "Try a different name or email."],
  ["إدارة المركز", "Center management"],
  ["الحصص والباقات", "Classes & plans"],
  [
    "انشر حصة جديدة أو أضف باقة عضوية.",
    "Publish a class or add a membership plan.",
  ],
  ["إضافة باقة", "Add a plan"],
  ["اسم الباقة", "Plan name"],
  ["السعر بالدينار الأردني", "Price in Jordanian dinars"],
  ["المدة بالأيام", "Duration in days"],
  ["الحصص المشمولة", "Included class types"],
  ["إضافة الباقة", "Add plan"],
  ["الباقات الحالية:", "Current plans:"],
  ["سجل التدقيق", "Audit log"],
  [
    "تغييرات العضوية والجدول، تجاوز الإيقاف، وعمليات البوابة.",
    "Membership and schedule changes, suspension overrides and gate checks.",
  ],
  ["الوقت", "Time"],
  ["الفاعل", "Actor"],
  ["العملية", "Action"],
  ["السجل", "Record"],
  ["التفاصيل", "Details"],
  ["السجل فارغ", "The log is empty"],
  [
    "ستظهر هنا العمليات التي يجريها المستخدمون.",
    "User actions will appear here.",
  ],
  ["قائمة الحضور", "Attendance list"],
  ["عرض رمز الاستوديو", "Show studio code"],
  ["إلغاء الحصة", "Cancel class"],
  ["العضو", "Member"],
  ["لا توجد حجوزات", "No bookings"],
  ["لم يسجل أعضاء في هذه الحصة.", "No members have booked this class."],
  ["تأكيد الاشتراك", "Confirm membership"],
  [
    "عملية تجريبية فقط. لا يتم خصم أي مبلغ.",
    "Simulated payment. No money will be charged.",
  ],
  ["تأكيد الدفع التجريبي", "Confirm simulated payment"],
  [
    "المقعد رح ينتقل لأول عضو مؤهل بقائمة الانتظار.",
    "The place will go to the first eligible member on the waiting list.",
  ],
  ["تأكيد إلغاء الحصة", "Confirm class cancellation"],
  [
    "سيتم إلغاء الحجوزات وإشعار جميع المسجلين.",
    "Bookings will be cancelled and everyone registered will be notified.",
  ],
  ["رمز الاستوديو", "Studio code"],
  ["رمز حضور الاستوديو", "Studio check-in code"],
  ["نص رمز الاستوديو", "Studio code text"],
  [
    "صالح لدقيقة واحدة. اعرض رمزاً جديداً عند انتهاء الصلاحية.",
    "Valid for one minute. Show a new code when it expires.",
  ],
  ["شراء عضوية للعضو", "Buy a membership for this member"],
  ["رفع إيقاف الحجز", "Lift booking suspension"],
  ["سبب التجاوز", "Override reason"],
  ["حفظ القرار", "Save decision"],
  ["معلومات الحساب", "Account information"],
  ["حسابي", "My account"],
  ["بيانات دخولك إلى GymPassJUST", "Your GymPassJUST account details"],
  ["نوع الحساب:", "Account role:"],
  ["نوع الحساب", "Account role"],
  ["تغيير كلمة المرور", "Change password"],
  ["حفظ كلمة المرور", "Save password"],
  ["إدارة الحسابات", "Account management"],
  [
    "إنشاء حساب طالب أو موظف وتحديد صلاحياته.",
    "Create a student or staff account and assign its role.",
  ],
  ["إضافة حساب", "Add an account"],
  ["آخر الحسابات المحلية", "Recent local accounts"],
  ["الاسم", "Name"],
  ["الصلاحية", "Role"],
  ["طالب", "Student"],
  ["مدرب الحصص", "Class instructor"],
  ["موظف الاستقبال", "Reception staff"],
  ["أمن البوابة", "Gate security"],
  ["مدير المركز", "Center manager"],
  ["خدمات المركز الرياضي", "Sports center services"],
  ["خروج", "Sign out"],
  ["تعذر تحميل الصفحة", "Could not load the page"],
  ["حاول مجدداً", "Try again"],
  ["الإيميل أو كلمة المرور غير صحيحة.", "Email or password is incorrect."],
  ["تأكد من الاسم والبريد الإلكتروني.", "Check the name and email address."],
  [
    "كلمة المرور لازم تكون من 12 إلى 128 حرفاً.",
    "Password must contain 12 to 128 characters.",
  ],
  [
    "هذا الإيميل مسجّل مسبقاً. جرّب تسجيل الدخول.",
    "This email is already registered. Try signing in.",
  ],
  [
    "تأكد من بيانات الحصة. الموعد لازم يكون بالمستقبل والمدة أقل من 4 ساعات.",
    "Check the class details. It must start in the future and last at most four hours.",
  ],
  [
    "يفتح الحجز قبل موعد الحصة بـ48 ساعة.",
    "Booking opens 48 hours before the class.",
  ],
  [
    "تحتاج عضوية فعالة تشمل هذه الحصة وتغطي مدتها.",
    "You need an active membership that includes this class and covers its duration.",
  ],
  [
    "حجز الحصص موقوف مؤقتاً لهذا الحساب.",
    "Class booking is temporarily suspended for this account.",
  ],
  ["عندك حجز سابق لهذه الحصة.", "You already have a booking for this class."],
  [
    "يوجد تعارض في الوقت مع حجز أو موعد آخر.",
    "This time overlaps another booking or assignment.",
  ],
  [
    "يمكن الإلغاء قبل الحصة بساعتين على الأقل.",
    "Cancel at least two hours before the class.",
  ],
  ["الحجز لهذه الحصة مغلق.", "Booking for this class is closed."],
  [
    "بدأت الحصة ولا يمكن إلغاؤها.",
    "This class has started and cannot be cancelled.",
  ],
  [
    "تسجيل الحضور غير متاح في هذا الوقت.",
    "Check-in is not available at this time.",
  ],
  [
    "لا يمكن تنفيذ العملية على حالة الحجز الحالية.",
    "This action is unavailable for the current booking state.",
  ],
  [
    "هذه العملية غير متاحة لحسابك.",
    "This action is not available for your account.",
  ],
  [
    "تم استخدام الرمز. انتظر ظهور الرمز الجديد.",
    "This code was used. Wait for a new code.",
  ],
  [
    "انتهت صلاحية الرمز. اطلب رمزاً جديداً.",
    "This code expired. Request a new code.",
  ],
  ["الرمز غير صحيح.", "Invalid code."],
  [
    "اكتب سبباً واضحاً من 5 أحرف على الأقل.",
    "Enter a clear reason of at least five characters.",
  ],
  ["لم يتم العثور على السجل المطلوب.", "The requested record was not found."],
  [
    "انتهت صلاحية الطلب. حدّث الصفحة وحاول مرة ثانية.",
    "The request could not be verified. Refresh the page and try again.",
  ],
  [
    "طلبات كثيرة. انتظر دقيقة وحاول مجدداً.",
    "Too many requests. Wait a while and try again.",
  ],
  [
    "تعذر قراءة استجابة الخادم. حاول مجدداً.",
    "Could not read the server response. Try again.",
  ],
  ["تعذر إكمال الطلب.", "Could not complete the request."],
  ["كلمتا المرور غير متطابقتين.", "The passwords do not match."],
  ["تعذر تسجيل الدخول. حاول مرة أخرى.", "Could not sign in. Try again."],
  [
    "تم تسجيل طلبك. حالة الحجز ظاهرة على الحصة.",
    "Your request was saved. The class shows your booking status.",
  ],
  ["تم إلغاء الحجز.", "Booking cancelled."],
  ["تم الاشتراك التجريبي بنجاح.", "Simulated membership purchase completed."],
  ["تم نسخ الرمز.", "Code copied."],
  ["تم الحضور", "Checked in"],
  ["تم تسجيل الحضور.", "Attendance recorded."],
  [
    "أُلغيت الحصة وأُرسلت الإشعارات.",
    "Class cancelled and notifications sent.",
  ],
  [
    "تم تغيير كلمة المرور وإنهاء الجلسات الأخرى.",
    "Password changed. Other sessions have been ended.",
  ],
  [
    "تم إنشاء الحساب. سلّم بيانات الدخول لصاحبه.",
    "Account created. Give the login details to its owner.",
  ],
  ["تم تسجيل حضورك.", "You have been checked in."],
  [
    "تم رفع الإيقاف مع تسجيل السبب.",
    "Suspension lifted and the reason recorded.",
  ],
  [
    "تم نشر الحصة وظهرت في جدول الطلاب.",
    "Class published and visible in the student schedule.",
  ],
  ["تمت إضافة الباقة.", "Plan added."],
  [
    "قراءة QR بالكاميرا غير مدعومة في هذا المتصفح. الصق الرمز في الحقل.",
    "Camera QR scanning is unavailable in this browser. Paste the code into the field.",
  ],
  [
    "تعذرت ترقية حجزك بسبب حالة العضوية أو الإيقاف.",
    "Your waitlist place could not be promoted because of membership status or suspension.",
  ],
  [
    "تم تفعيل اشتراكك التجريبي أو تجديده.",
    "Your simulated membership was activated or renewed.",
  ],
  [
    "تم إيقاف حجز الحصص لمدة 7 أيام بسبب تكرار الغياب.",
    "Class booking is suspended for seven days after repeated no-shows.",
  ],
  [
    "اشتراكك ينتهي خلال ثلاثة أيام. يمكنك تجديده من صفحة العضوية.",
    "Your membership ends within three days. Renew it on the membership page.",
  ],
  ["الدخول مرفوض: العضوية غير فعالة", "Entry denied: inactive membership"],
  ["الدخول مسموح", "Entry allowed"],
];
pairs.push(
  ["بطاقة الاشتراك", "Membership pass"],
  ["عرض بطاقة الاشتراك", "Show membership pass"],
  ["التحقق من الاشتراك", "Verify membership"],
  ["تحقق من الاشتراك", "Verify membership"],
  ["جارٍ التحقق من الاشتراك…", "Checking membership…"],
  [
    "افحص QR الطالب لمعرفة إذا اشتراكه فعّال عند الباب.",
    "Scan the student's QR at the door to check whether their membership is active.",
  ],
  ["فحص بطاقة الطالب", "Scan student pass"],
  ["رمز بطاقة الطالب", "Student pass code"],
  [
    "اعرض الرمز للمدرب عند الباب للتحقق من صلاحية اشتراكك.",
    "Show this code to the instructor at the door to verify your membership.",
  ],
  ["رمز QR للتحقق من الاشتراك", "Membership verification QR code"],
  ["اشتراك فعّال", "Active membership"],
  ["لا يوجد اشتراك فعّال", "No active membership"],
  [
    "يتجدد الرمز تلقائياً كل دقيقة.",
    "The code refreshes automatically every minute.",
  ],
  ["التحقق عند الباب", "Verification at the door"],
  [
    "المدرب يفحص الرمز من حسابه ويشوف حالة اشتراكك الحالية.",
    "The instructor scans the code from their account to see your current membership status.",
  ],
  ["نسخ الرمز للتحقق اليدوي", "Copy code for manual verification"],
  ["اشتراك فعّال — يسمح بالدخول", "Active membership — entry allowed"],
  [
    "لا يوجد اشتراك فعّال — لا يسمح بالدخول",
    "No active membership — entry denied",
  ],
  [
    "أنت مشترك بالفعل في هذه الباقة. يمكنك الاشتراك مجدداً بعد انتهائها.",
    "You already have this plan. You can subscribe again after it expires.",
  ],
  [
    "لا يمكن شراء الباقة نفسها مرة أخرى حتى ينتهي اشتراكك فيها.",
    "You can buy the same plan again after your current subscription expires.",
  ],
  ["مشترك فيها", "Subscribed"],
  ["مشترك بالفعل", "Already subscribed"],
  ["حجز الحصص وبطاقة الاشتراك", "Class booking and membership pass"],
  ["المسجلون والتفاصيل", "Bookings & details"],
  ["المسجلون في الحصة", "Students booked in this class"],
  ["حصصك", "My classes"],
  [
    "افحص عضويات الطلاب وسجّل اشتراكاً تجريبياً.",
    "View student memberships and record a simulated subscription.",
  ],
  [
    "تغييرات العضوية والجدول وسجل قرارات الإدارة.",
    "Membership changes, schedule updates and management decisions.",
  ],
  [
    "مؤشرات العضوية والحجز من بيانات النظام الحالية.",
    "Membership and booking figures from current system records.",
  ],
  ["إشغال الحصص", "Class occupancy"],
  [
    "تعذرت ترقية حجزك بسبب حالة العضوية أو تعارض الموعد.",
    "Your booking could not be promoted because of membership status or a timetable conflict.",
  ],
);
pairs.push(
  ["فحص QR وتسجيل الحضور", "Scan QR & record attendance"],
  ["فحص وتسجيل الحضور", "Scan & check in"],
  ["جارٍ فحص QR وتسجيل الحضور…", "Checking QR and recording attendance…"],
  [
    "اختَر حصتك ثم امسح QR الطالب أثناء وقت الحصة.",
    "Choose your class and scan the student's QR during class time.",
  ],
  [
    "لا يُقبل المسح بدون اشتراك فعّال وحجز مؤكد في الحصة المختارة.",
    "Scanning requires an active membership and a confirmed booking in the selected class.",
  ],
  ["الحصة المختارة", "Selected class"],
  ["لا توجد حصص قادمة", "No upcoming classes"],
  [
    "انشر حصة أولاً. المسح متاح من بداية الحصة حتى نهايتها.",
    "Publish a class first. Scanning is available from class start until class end.",
  ],
  [
    "الطالب غير مسجّل بحجز مؤكد في هذه الحصة.",
    "This student has no confirmed booking in the selected class.",
  ],
  [
    "مسح QR وتسجيل الحضور متاح فقط من بداية الحصة حتى نهايتها.",
    "QR attendance is available only from class start until class end.",
  ],
  [
    "اعرض الرمز للمدرب عند باب الحصة للتحقق من اشتراكك وتسجيل حضورك.",
    "Show your QR to the instructor at the class door to verify your membership and record attendance.",
  ],
  [
    "المدرب يختار الحصة ويفحص الرمز. يتم تسجيل حضورك فقط إذا اشتراكك فعّال وحجزك مؤكد بالحصة.",
    "The instructor selects the class and scans your code. Attendance is recorded only with an active membership and confirmed booking.",
  ],
  [
    "الحضور يُسجّل بمسح QR عند المدرب أثناء الحصة. عدم المسح يُحسب غياباً بعد نهايتها.",
    "The instructor records attendance by scanning your QR during class. No scan means absent after class ends.",
  ],
  ["تم تسجيل حضور هذا الطالب مسبقاً", "This student is already checked in"],
  [
    "اشتراك فعّال وحجز مؤكد — تم تسجيل الحضور",
    "Active membership and confirmed booking — attendance recorded",
  ],
  [
    "الكاميرا تحتاج متصفحاً يدعمها واتصال HTTPS أو localhost.",
    "Camera access requires a supported browser on HTTPS or localhost.",
  ],
  ["غائب", "Absent"],
);
const exact = new Map(pairs);
const ordered = [...pairs]
  .sort((a, b) => b[0].length - a[0].length)
  .map(([ar, en]) => [
    new RegExp(
      "(?<![\\u0600-\\u06ff])" +
        ar.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") +
        "(?![\\u0600-\\u06ff])",
      "gu",
    ),
    en,
  ]);
const months = [
  ["كانون الثاني", "January"],
  ["شباط", "February"],
  ["آذار", "March"],
  ["نيسان", "April"],
  ["أيار", "May"],
  ["حزيران", "June"],
  ["تموز", "July"],
  ["آب", "August"],
  ["أيلول", "September"],
  ["تشرين الأول", "October"],
  ["تشرين الثاني", "November"],
  ["كانون الأول", "December"],
  ["الأحد", "Sunday"],
  ["الاثنين", "Monday"],
  ["الثلاثاء", "Tuesday"],
  ["الأربعاء", "Wednesday"],
  ["الخميس", "Thursday"],
  ["الجمعة", "Friday"],
  ["السبت", "Saturday"],
];
export function translateText(value, language = "en") {
  if (language !== "en") return value;
  const text = String(value),
    clean = text.trim();
  if (exact.has(clean)) return text.replace(clean, exact.get(clean));
  let out = text.replace(/[٠-٩]/g, (n) => "٠١٢٣٤٥٦٧٨٩".indexOf(n));
  const rules = [
    [/^أهلاً، (.+)$/u, (_, name) => `Welcome, ${name}`],
    [/^صفحة (\d+) من (\d+)$/u, "Page $1 of $2"],
    [/^(\d+) حصة ضمن الجدول$/u, "$1 classes in the schedule"],
    [
      /^حضرت في (\d+) يوم مختلف\. (\d+) يوم حضور متتالٍ حتى آخر حصة مسجلة\.$/u,
      "You attended on $1 different days. Your latest attendance streak is $2 days.",
    ],
    [/^أصبح حجزك مؤكداً في (.+)\.$/u, "Your booking for $1 is now confirmed."],
    [/^تم تأكيد حجز (.+)\.$/u, "Your booking for $1 is confirmed."],
    [/^أُضيف اسمك لقائمة انتظار (.+)\.$/u, "You joined the waitlist for $1."],
    [/^تم إلغاء حجز (.+)\.$/u, "Your booking for $1 was cancelled."],
    [/^ألغى المدرب حصة (.+)\.$/u, "The instructor cancelled $1."],
    [/^تم إلغاء حصة (.+)\.$/u, "$1 was cancelled."],
    [/^تم تسجيل غيابك عن (.+)\.$/u, "A no-show was recorded for $1."],
    [
      /^تذكير بموعد (.+) خلال ساعتين\.$/u,
      "Reminder: $1 starts within two hours.",
    ],
  ];
  for (const [pattern, replacement] of rules)
    if (pattern.test(out.trim())) {
      out = out.trim().replace(pattern, replacement);
      break;
    }
  // Protect complete translated phrases from shorter Arabic keys inside them.
  const fragments = out.split(/(\s{2,}|\n)/);
  out = fragments
    .map((part) =>
      exact.get(part.trim())
        ? part.replace(part.trim(), exact.get(part.trim()))
        : part,
    )
    .join("");
  for (const [pattern, en] of ordered) out = out.replace(pattern, en);
  for (const [ar, en] of months) out = out.replaceAll(ar, en);
  return out
    .replace(/عضو تجريبي (\d+)/gu, "Sample member $1")
    .replace(/استوديو (\d+)/gu, "Studio $1")
    .replace(/Instructor (\d+)/g, "Instructor $1")
    .replace(/(\d+) دقيقة/gu, "$1 min")
    .replace(/(\d+) يوم/gu, "$1 days")
    .replace(/(\d+) مقعد/gu, "$1 seats")
    .replace(/انتظار (\d+)/gu, "Waiting: $1")
    .replace(/ترتيبك (\d+)/gu, "Your position: $1")
    .replace(/حصة ضمن الجدول/gu, "classes in the schedule")
    .replace(/فعالة حتى/gu, "Active until")
    .replace(/صالحة حتى/gu, "Valid until")
    .replace(/صالح حتى/gu, "Valid until")
    .replace(/لمدة (\d+) days/gu, "for $1 days")
    .replace(/يومياً/gu, "Daily")
    .replace(/(?<![\u0600-\u06ff])جديد(?![\u0600-\u06ff])/gu, "New")
    .replace(/د\.أ/gu, "JOD")
    .replace(/(\d)٬(?=\d)/gu, "$1,")
    .replace(/٫/gu, ".")
    .replace(/(\d) ص/gu, "$1 AM")
    .replace(/(\d) م/gu, "$1 PM")
    .replaceAll("،", ",");
}

export function installLanguageSwitcher() {
  const button = document.querySelector("#language-toggle");
  let language = "ar";
  try {
    language =
      localStorage.getItem("gympassjust-language") === "en" ? "en" : "ar";
  } catch {}
  const nodes = new WeakMap(),
    attributes = new WeakMap();
  let observer;
  function sourceValue(cache, key, value) {
    const old = cache.get(key);
    return old?.last === value ? old.source : value;
  }
  function localize() {
    observer?.disconnect();
    document.documentElement.lang = language;
    document.documentElement.dir = language === "ar" ? "rtl" : "ltr";
    button.textContent = language === "ar" ? "English" : "عربي";
    button.setAttribute(
      "aria-label",
      language === "ar" ? "Switch to English" : "التحويل إلى العربية",
    );
    const walker = document.createTreeWalker(
      document.documentElement,
      NodeFilter.SHOW_TEXT,
    );
    let node;
    while ((node = walker.nextNode())) {
      if (
        !node.parentElement ||
        node.parentElement.closest(
          "script,style,textarea,#language-toggle,[translate=no]",
        )
      )
        continue;
      const source = sourceValue(nodes, node, node.nodeValue);
      const last = translateText(source, language);
      nodes.set(node, { source, last });
      if (node.nodeValue !== last) node.nodeValue = last;
    }
    for (const element of document.querySelectorAll(
      "[aria-label],[placeholder],img[alt]",
    )) {
      if (element === button) continue;
      const values = attributes.get(element) || new Map();
      for (const key of ["aria-label", "placeholder", "alt"]) {
        if (!element.hasAttribute(key)) continue;
        const source = sourceValue(values, key, element.getAttribute(key)),
          last = translateText(source, language);
        values.set(key, { source, last });
        if (element.getAttribute(key) !== last) element.setAttribute(key, last);
      }
      attributes.set(element, values);
    }
    observer?.observe(document.documentElement, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["aria-label", "placeholder", "alt"],
    });
  }
  observer = new MutationObserver(localize);
  button.addEventListener("click", () => {
    language = language === "ar" ? "en" : "ar";
    try {
      localStorage.setItem("gympassjust-language", language);
    } catch {}
    localize();
  });
  localize();
  return { localize, language: () => language };
}
