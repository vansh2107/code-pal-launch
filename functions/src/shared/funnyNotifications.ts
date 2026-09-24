/**
 * Funny notification message pools.
 *
 * Direct port of supabase/functions/_shared/funnyNotifications.ts.
 * Types and content are unchanged.
 */

export type NotificationType =
  | 'task_reminder'
  | 'task_incomplete'
  | 'task_lazy_3days'
  | 'document_expiring'
  | 'document_expired'
  | 'document_added'
  | 'daily_summary'
  | 'otp'
  | 'welcome';

interface FunnyNotification {
  title: string;
  message: string;
}

const pools: Record<NotificationType, FunnyNotification[]> = {
  task_reminder: [
    { title: "⏰ Hey, Your Task Is Waiting!", message: "It's been patiently sitting there like a good little task. Time to show it some love! 💪" },
    { title: "🎯 Task Alert!", message: "Your task isn't going to complete itself (we checked). Let's do this! 🚀" },
    { title: "📋 Knock Knock!", message: "Who's there? Your task! It's been waiting and it's getting a liiittle impatient 😅" },
    { title: "⚡ Rise and Grind!", message: "Your future self will thank you for tackling this task right now. Let's go! 🏆" },
    { title: "🔔 Friendly Reminder!", message: "That task you added? Still there. Still waiting. Still believing in you! ✨" },
  ],
  task_incomplete: [
    { title: "😅 Unfinished Business!", message: "Your task is giving you the puppy eyes. It just wants to be completed! 🐶" },
    { title: "🤔 Procrastination Detection!", message: "Our highly sophisticated AI detected procrastination. The cure? Do the task! 💊" },
    { title: "⏳ Time Flies!", message: "Remember that task? It remembers you! Let's reunite and get it done! 🤝" },
    { title: "📌 Still Pending!", message: "Your task has been patiently waiting. It's very zen about it, but still... 🧘" },
    { title: "🎪 Task Circus!", message: "Step right up! Today only: complete your task and feel AMAZING! 🎉" },
  ],
  task_lazy_3days: [
    { title: "😱 3 Days! Really?!", message: "This task has been waiting 3 days! Even mountains erode faster. Let's gooo! ⛰️" },
    { title: "🦥 Sloth Speed Alert!", message: "Your task completion speed has been classified as 'glacial'. Time to turbo-boost! 🚀" },
    { title: "📅 History in the Making!", message: "3 days old and still pending. This task is practically vintage now! 🍷" },
    { title: "🚨 Code Red!", message: "3 days! Your task has filed a missing person report on you. Please check in! 🕵️" },
    { title: "🏆 Persistence Award!", message: "Your task wins the award for 'Most Patient Task Ever' after 3 days. Now finish it! 🥇" },
  ],
  document_expiring: [
    { title: "📄 Document Expiry Warning!", message: "Your document is like milk — it has an expiry date! Time to renew before it goes bad! 🥛" },
    { title: "⏰ Tick Tock!", message: "Your document's clock is ticking! Don't let it expire on you like last year's gym membership 💪" },
    { title: "🚨 Renewal Alert!", message: "Houston, we have a document expiring soon! Mission: Renew ASAP! 🚀" },
    { title: "📋 Don't Let It Expire!", message: "Your document is approaching its 'best before' date. Renew it while it's still fresh! 🌟" },
    { title: "⚡ Action Required!", message: "Your document sent an SOS! It's expiring soon and needs your attention ASAP! 🆘" },
  ],
  document_expired: [
    { title: "💀 Document Expired!", message: "Your document has officially retired. Time to give it a proper renewal ceremony! 🎭" },
    { title: "🚫 Expired Alert!", message: "Oops! Your document expired. It had a good run, but now it needs a refresh! 🔄" },
    { title: "📛 Renewal Overdue!", message: "Your document is now in expired territory. Time for a comeback! 🦸" },
  ],
  document_added: [
    { title: "🎉 New Document Added!", message: "Your document is safely stored in the vault. Your future self just got more organised! 📁" },
    { title: "✅ Document Saved!", message: "One more document secured! You're becoming a document management legend! 🏆" },
  ],
  daily_summary: [
    { title: "🌅 Your Daily Digest!", message: "Morning! Here's what's on your plate today. Let's crush it! 💪" },
    { title: "📊 Daily Update!", message: "Here's your daily briefing, Agent. Choose to accept these tasks... 🕵️" },
    { title: "☀️ Good Morning!", message: "Rise and shine! Your documents and tasks are ready for review! 🌟" },
  ],
  otp: [
    { title: "🔐 Your Verification Code!", message: "Your OTP has arrived! Use it quickly — it's shy and disappears fast! 💨" },
    { title: "🔑 Secret Code Incoming!", message: "Your super secret verification code is here! Keep it safe from spies! 🕵️" },
  ],
  welcome: [
    { title: "🎉 Welcome to Remonk!", message: "You just made the smartest document decision of your life. Welcome aboard! 🚀" },
    { title: "✨ You're In!", message: "Welcome! Your documents called — they're thrilled to have such an organised owner! 📄" },
  ],
};

/**
 * Return a random notification from the given type pool.
 */
export function getFunnyNotification(type: NotificationType): FunnyNotification {
  const pool = pools[type];
  if (!pool || pool.length === 0) {
    return { title: '🔔 Reminder', message: 'You have a pending reminder.' };
  }
  return pool[Math.floor(Math.random() * pool.length)];
}
