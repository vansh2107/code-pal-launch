import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const CONTACT = 'support@remonk.app';
const UPDATED = 'November 5, 2026';

type Section = { h: string; p: (string | string[])[] };

const TERMS: Section[] = [
  { h: '1. Acceptance', p: ['By creating an account or using Remonk Reminder ("the App"), you agree to these Terms. If you do not agree, do not use the App.'] },
  { h: '2. The Service', p: ['Remonk Reminder is a personal productivity tool that helps you store your documents, track expiry dates, receive reminders, and manage daily tasks and routines.'] },
  { h: '3. Not affiliated with any government', p: ['Remonk Reminder is an independent app. It is not affiliated with, endorsed by, or connected to any government, passport office, transport authority, licensing body or other official agency. The App does not issue, verify or renew any official document. You remain responsible for completing renewals with the proper authority.'] },
  { h: '4. Reminders are an aid, not a guarantee', p: ['Notifications depend on your device, its battery-saving settings, network connection and third-party delivery services. We cannot guarantee that every reminder will be delivered on time. You are responsible for keeping track of your own deadlines.'] },
  { h: '5. Automatic text reading', p: ['The App can read dates and details from scanned documents automatically. This can make mistakes. Always check the extracted details before saving.'] },
  { h: '6. Your account', p: ['You must be at least 13 years old (16 in the EU/UK). Keep your password safe; you are responsible for activity on your account. Provide accurate information.'] },
  { h: '7. Your content', p: ['You own the documents, photos and notes you upload. You give us permission to store and process them only to provide the App to you. You must not upload forged documents, documents belonging to others without permission, or anything illegal or harmful.'] },
  { h: '8. Deleting your account', p: ['You can delete your account at any time from Profile → Edit Profile → Delete Account. We may suspend accounts that break these Terms.'] },
  { h: '9. Limitation of liability', p: ['The App is provided "as is". To the fullest extent permitted by law, we are not liable for missed deadlines, expired documents, fines, travel disruption, data loss, or any indirect or consequential damages arising from use of the App.'] },
  { h: '10. Changes', p: ['We may update these Terms. The date above shows the latest version. Continuing to use the App after a change means you accept it.'] },
  { h: '11. Contact', p: [`Questions? Email ${CONTACT} or use the Help Center in the App.`] },
];

const PRIVACY: Section[] = [
  { h: '1. Who we are', p: ['This policy explains how Remonk Reminder collects and uses your information.'] },
  { h: '2. Information we collect', p: [[
    'Account details: name, email, country, timezone and app preferences.',
    'Content you add: document photos, PDFs, document names, categories, expiry dates and notes; tasks, routines and task photos.',
    'Device information: a notification ID for your device, device type and app version, used to send reminders.',
  ]] },
  { h: '3. Device permissions', p: [[
    'Camera — only when you choose to scan a document or take a task photo.',
    'Photos / files — only when you pick an image or PDF to upload.',
    'Notifications — to send document and task reminders.',
  ], 'You can turn these off at any time in your phone settings.'] },
  { h: '4. How we use it', p: ['To store your documents, calculate and send reminders in your local time, read details from scans, keep your account secure, and answer support requests. We do not sell your personal data and do not use it for advertising.'] },
  { h: '5. Services we use', p: [[
    'Google Firebase — sign-in, database, file storage and server tasks.',
    'OneSignal — delivering push notifications.',
    'Google AI services — reading text and dates from scanned documents.',
  ], 'These providers process data only to deliver their part of the service.'] },
  { h: '6. Security', p: ['Your documents are stored in private storage that only your signed-in account can access, and data is sent over secure (HTTPS) connections. No system is perfectly secure, but we work to protect your information.'] },
  { h: '7. Keeping and deleting your data', p: ['We keep your data while your account is active. You can delete your account and its data at any time from Profile → Edit Profile → Delete Account. If you cannot open the App, email us from your registered address and we will delete your data within 30 days.'] },
  { h: '8. Your rights', p: ['Depending on where you live, you may have the right to access, correct, export or delete your data. You can export your data from the Profile page or contact us.'] },
  { h: '9. Children', p: ['The App is not meant for children under 13. If you believe a child has given us data, contact us and we will delete it.'] },
  { h: '10. Changes', p: ['We may update this policy; the date above shows the latest version.'] },
  { h: '11. Contact', p: [`Email ${CONTACT}.`] },
];

export default function Legal({ kind }: { kind: 'terms' | 'privacy' }) {
  const navigate = useNavigate();
  const title = kind === 'terms' ? 'Terms & Conditions' : 'Privacy Policy';
  const sections = kind === 'terms' ? TERMS : PRIVACY;

  return (
    <div className="min-h-screen w-full bg-background flex flex-col" style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}>
      <header className="w-full flex items-center justify-between px-4 py-4">
        <button onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/'))} aria-label="Go back" className="h-8 w-8 flex items-center justify-center rounded-full hover:bg-muted">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="text-xl font-semibold text-foreground">{title}</h1>
        <div style={{ width: 32 }} />
      </header>
      <main className="flex-1 w-full max-w-2xl mx-auto px-4 pb-10 space-y-5 text-sm leading-relaxed text-muted-foreground">
        <p className="text-xs">Last updated: {UPDATED}</p>
        {sections.map((s) => (
          <section key={s.h} className="space-y-2">
            <h2 className="text-base font-semibold text-foreground">{s.h}</h2>
            {s.p.map((x, i) => Array.isArray(x)
              ? <ul key={i} className="list-disc pl-5 space-y-1">{x.map((li) => <li key={li}>{li}</li>)}</ul>
              : <p key={i}>{x}</p>)}
          </section>
        ))}
      </main>
    </div>
  );
}
