import test from "node:test";
import assert from "node:assert/strict";
import { translateText } from "../public/i18n.js";

test("English UI covers role navigation, form errors, dynamic dates, counts and notifications", () => {
  assert.equal(
    translateText("تم إلغاء حصة يوغا وتوازن."),
    "Yoga & balance was cancelled.",
  );
  assert.equal(
    translateText("انتهت الحصة ولا يمكن إلغاؤها."),
    "This class has ended and cannot be cancelled.",
  );
  assert.equal(
    translateText("يتجدد الرمز تلقائياً كل 30 ثانية، وصلاحيته دقيقتان."),
    "The code refreshes every 30 seconds and is valid for two minutes.",
  );
  assert.equal(translateText("إدارة الحسابات"), "Account management");
  assert.equal(translateText("نشر حصة جديدة"), "Publish a class");
  assert.equal(
    translateText("كلمتا المرور غير متطابقتين."),
    "The passwords do not match.",
  );
  assert.equal(translateText("صفحة 2 من 5"), "Page 2 of 5");
  assert.equal(
    translateText("الاثنين، ٢ تشرين الثاني · ٧:٠٠ م"),
    "Monday, 2 November · 7:00 PM",
  );
  assert.equal(
    translateText("تم تأكيد حجز يوغا وتوازن."),
    "Your booking for Yoga & balance is confirmed.",
  );
  assert.equal(translateText("١٢ دقيقة"), "12 min");
  assert.equal(translateText("الاسم الكامل", "ar"), "الاسم الكامل");
  assert.equal(translateText("student@example.com"), "student@example.com");
  assert.equal(translateText("ليان أحمد"), "ليان أحمد");
  assert.equal(translateText("تمرين اللياقة المسائي"), "تمرين اللياقة المسائي");
  assert.equal(translateText("قاعة اللياقة الجديدة"), "قاعة اللياقة الجديدة");
});
