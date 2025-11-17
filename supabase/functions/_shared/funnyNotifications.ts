/**
 * Funny Notification Message Generator
 * Swiggy/Zomato-style playful tone for all app notifications
 */

interface NotificationMessage {
  title: string;
  message: string;
}

const getRandomItem = <T,>(array: T[]): T => {
  return array[Math.floor(Math.random() * array.length)];
};

// Task Reminder Messages (2-hour reminders)
const taskReminderMessages: NotificationMessage[] = [
  { title: "📋 Hey you!", message: "Your tasks are waiting like a loyal dog… please complete them 🐶❤️" },
  { title: "👀 Psst...", message: "Bro your tasks are still pending. Even I'm getting stressed 👀" },
  { title: "😭 Your tasks say:", message: "'When will you complete me yaaaar?' 😭😂" },
  { title: "🤗 Future You says:", message: "Finish it now, I'll give you a hug later 🤗" },
  { title: "⏰ Reminder Alert", message: "Your to-do list is judging you right now 😏" },
  { title: "💪 You got this!", message: "These tasks won't complete themselves... unfortunately 😅" },
  { title: "🎯 Quick reminder", message: "Your tasks are feeling lonely. Show them some love! 💕" },
  { title: "🚀 Time to shine", message: "Let's knock out those tasks like a boss! 💼✨" },
  { title: "😎 Productivity check", message: "Your tasks are waiting. Don't ghost them bro 👻" },
  { title: "🔔 Ding dong", message: "Your pending tasks would like to have a word with you 📞" },
  { title: "⚡ Energy boost", message: "Complete a task = instant dopamine hit! Try it 🧠✨" },
  { title: "🎪 Task circus", message: "Your tasks are doing backflips for your attention 🤸‍♂️" },
  { title: "🌟 Star moment", message: "Be the hero your task list deserves! 🦸‍♂️" },
  { title: "☕ Coffee break over", message: "Time to tackle those tasks like a champion ☕💪" },
  { title: "🎮 Game on", message: "Level up by completing your tasks! 🎯🏆" },
];

// Task Incomplete (Daily check for incomplete tasks)
const taskIncompleteMessages: NotificationMessage[] = [
  { title: "📝 Still pending...", message: "You still have pending tasks waiting for you. Don't forget! 💭" },
  { title: "🙈 Oops", message: "These tasks are still here... just saying 👀" },
  { title: "⏱️ Tick tock", message: "Your tasks aren't going anywhere... complete them? 🙏" },
  { title: "💌 Love letter", message: "From your pending tasks: We miss you 💔" },
  { title: "🎭 Drama alert", message: "Your tasks are being dramatic about being incomplete 😂" },
  { title: "🌙 Bedtime story", message: "Once upon a time, there were tasks that needed completion... 📖" },
  { title: "🎪 Reminder circus", message: "Step right up! Get your fresh incomplete tasks here! 🎟️" },
  { title: "🦸 Hero needed", message: "Your tasks need a hero. Are you that hero? 🦸‍♀️" },
  { title: "🎯 Mission possible", message: "Your mission, should you choose to accept it: Complete tasks! 🕵️" },
  { title: "🌈 Motivational moment", message: "Every completed task is a step closer to your goals! 🎯✨" },
];

// 3-Day Lazy Alert (Tasks pending for 3+ days)
const lazyTaskMessages: NotificationMessage[] = [
  { title: "🚨 URGENT!", message: "3 days? Even your procrastination needs a break bro 😭😂" },
  { title: "💔 Task heartbroken", message: "Your pending task is now officially offended 💔" },
  { title: "🌚 Legend status", message: "Legend says you'll finish it… someday 🌚" },
  { title: "😱 SOS!", message: "This task has been waiting longer than my pizza delivery 🍕💀" },
  { title: "🎪 Historic moment", message: "This task is now a historical artifact 🏛️😂" },
  { title: "🦕 Fossil alert", message: "Your task is aging like fine wine... or milk 🥛😅" },
  { title: "👻 Ghost mode", message: "Are you ghosting your tasks? They're haunting you now 👻" },
  { title: "🏃‍♂️💨 Run!", message: "This task has been chasing you for 3 days! Stop running! 😂" },
  { title: "🎂 Anniversary", message: "Happy 3-day pending-versary! Now finish it 🎉😭" },
  { title: "⚰️ RIP", message: "This task's patience just died. Revive it with completion! 💀" },
  { title: "🔥 On fire!", message: "This task is so old it's on fire... metaphorically 🔥😂" },
  { title: "🌟 Ancient wisdom", message: "Even ancient philosophers completed tasks faster than this 📜" },
];

// Document Expiring Soon
const documentExpiringSoonMessages: NotificationMessage[] = [
  { title: "⚠️ Doc alert!", message: "Your document is about to expire… unlike your patience 😭" },
  { title: "🪫 Battery low", message: "Don't panic… but this doc is aging faster than your laptop battery 😅" },
  { title: "🏃‍♂️💨 Escape artist", message: "Renew this before it runs away from responsibilities 🏃‍♂️💨" },
  { title: "⏰ Time check", message: "Your doc is living on borrowed time! Renew ASAP ⚡" },
  { title: "🎯 Mission critical", message: "This document needs your attention before it's too late! 📄" },
  { title: "🚨 Red alert", message: "Document expiry incoming! Take action now! 🚀" },
  { title: "💡 Friendly reminder", message: "Your document is about to peace out... renew it? 🙏" },
  { title: "🎪 Last call", message: "Last chance to renew before this doc ghosts you! 👻" },
  { title: "⚡ Lightning round", message: "Quick! Your document needs renewal before time's up! ⏱️" },
  { title: "🌟 Star reminder", message: "Be a star, renew your document before it expires! ⭐" },
  { title: "🔔 Ding ding", message: "Your document is ringing the alarm bell! 🔔📄" },
  { title: "💝 Show some love", message: "Your document needs some renewal love! Don't ignore it 💕" },
];

// Document Expired
const documentExpiredMessages: NotificationMessage[] = [
  { title: "💀 RIP", message: "Your doc just expired. Like my motivation on Mondays 😔" },
  { title: "👻 Ghost doc", message: "Uh oh… another document joined the expired gang 💀" },
  { title: "🎂 Too old", message: "Your document is officially older than my jokes 😭💀" },
  { title: "⚰️ Funeral time", message: "Your document has left the chat... permanently 💔" },
  { title: "🚨 Emergency!", message: "EXPIRED! Time to renew before the world ends! 🌍😂" },
  { title: "😱 Oh no!", message: "Your document just expired... awkward 😬" },
  { title: "🎭 Drama unfolds", message: "Plot twist: Your document expired! Renew now! 📄" },
  { title: "🌙 Goodnight doc", message: "Your document has expired and gone to sleep... wake it up! 😴" },
  { title: "💥 Boom!", message: "Document expiry bomb just exploded! Renew ASAP! 💣" },
  { title: "🏴‍☠️ Pirates won", message: "Your document walked the plank and expired! Arr! 🏴‍☠️" },
];

// Document Added Successfully
const documentAddedMessages: NotificationMessage[] = [
  { title: "🎉 Success!", message: "Your document is safe with us! We'll remind you, don't worry 😎" },
  { title: "✅ All set!", message: "Document added! Now you can relax... we got your back 🤗" },
  { title: "🚀 Uploaded!", message: "Your document is now in safe hands! We won't let it expire 💪" },
  { title: "🎯 Nailed it!", message: "Document saved! We'll bug you before it expires, promise 😂" },
  { title: "💾 Saved!", message: "Your doc is secure! Now go chill, we'll handle reminders ☕" },
  { title: "🌟 Star move!", message: "Document added like a boss! We'll keep you updated 😎" },
  { title: "🎪 Welcome aboard!", message: "Your document just joined the family! We'll take care of it 💕" },
  { title: "🔒 Locked in!", message: "Document secured! Expiry reminders activated 🚀" },
];

// Daily Summary / Morning Reminder
const dailySummaryMessages: NotificationMessage[] = [
  { title: "🌅 Good morning!", message: "Rise and shine! Here's what's cooking today ☀️" },
  { title: "☕ Morning vibes", message: "Coffee ready? Let's check what's on your plate today! ☕📋" },
  { title: "🌟 New day!", message: "Another day to be awesome! Check your pending items 💪" },
  { title: "🎯 Daily dose", message: "Your daily reminder is here! Let's crush it today 🚀" },
  { title: "🦸 Hero time!", message: "Be the hero of your day! Here's your task list 🦸‍♀️" },
  { title: "🌈 Fresh start", message: "New day, new opportunities! Let's do this 🎪" },
  { title: "⚡ Energy boost", message: "Good morning champ! Time to tackle your goals ⚡" },
  { title: "🎪 Daily circus", message: "Welcome to today's show! Here's what needs attention 🎭" },
];

// OTP Messages (Friendly but not too funny)
const otpMessages: NotificationMessage[] = [
  { title: "🔐 Your code", message: "Your magic code is here! Don't share unless it's your mom 👀" },
  { title: "🎯 Verification", message: "Here's your secret code! Keep it safe 🔒" },
  { title: "✨ OTP arrived", message: "Your verification code is ready! Use it wisely 😊" },
  { title: "🔑 Access code", message: "Your key to enter! Don't share with strangers 🚪" },
  { title: "📱 Code alert", message: "Your OTP is here! Valid for a short time ⏰" },
  { title: "🎪 Entry pass", message: "Your VIP access code has arrived! 🎟️" },
  { title: "🌟 Secret code", message: "Psst... here's your verification code! Shhh 🤫" },
];

// Welcome Messages
const welcomeMessages: NotificationMessage[] = [
  { title: "🎉 Welcome!", message: "Welcome to the fam! We'll keep your docs & tasks in check 💪" },
  { title: "👋 Hey there!", message: "Glad to have you! Let's make life easier together 🚀" },
  { title: "🌟 You're in!", message: "Welcome aboard! We're excited to help you stay organized 😊" },
  { title: "🎪 Welcome!", message: "You just joined the coolest reminder app! Let's do this 🎯" },
  { title: "🚀 Lift off!", message: "Welcome! Your journey to never forgetting anything starts now ⚡" },
];

// Export main function
export function getFunnyNotification(
  type: string,
  data?: {
    taskTitle?: string;
    documentName?: string;
    daysUntilExpiry?: number;
    consecutiveDays?: number;
    taskCount?: number;
    documentCount?: number;
  }
): NotificationMessage {
  let messageSet: NotificationMessage[] = [];

  switch (type) {
    case "task_reminder":
      messageSet = taskReminderMessages;
      break;
    case "task_incomplete":
      messageSet = taskIncompleteMessages;
      break;
    case "task_lazy_3days":
      messageSet = lazyTaskMessages;
      break;
    case "document_expiring":
      messageSet = documentExpiringSoonMessages;
      break;
    case "document_expired":
      messageSet = documentExpiredMessages;
      break;
    case "document_added":
      messageSet = documentAddedMessages;
      break;
    case "daily_summary":
      messageSet = dailySummaryMessages;
      break;
    case "otp":
      messageSet = otpMessages;
      break;
    case "welcome":
      messageSet = welcomeMessages;
      break;
    default:
      return { title: "🔔 Reminder", message: "You have a notification!" };
  }

  const baseMessage = getRandomItem(messageSet);

  // Add custom data to message if provided
  if (data) {
    let customizedMessage = baseMessage.message;

    if (data.taskTitle) {
      customizedMessage = customizedMessage.replace(/tasks?/gi, `"${data.taskTitle}"`);
    }

    if (data.documentName) {
      customizedMessage += ` (${data.documentName})`;
    }

    if (data.daysUntilExpiry !== undefined) {
      customizedMessage += ` - Only ${data.daysUntilExpiry} ${
        data.daysUntilExpiry === 1 ? "day" : "days"
      } left!`;
    }

    if (data.consecutiveDays !== undefined && data.consecutiveDays >= 3) {
      customizedMessage = `Day ${data.consecutiveDays} and counting... ${customizedMessage}`;
    }

    if (data.taskCount !== undefined && data.taskCount > 1) {
      customizedMessage = `You have ${data.taskCount} incomplete tasks! ${customizedMessage}`;
    }

    if (data.documentCount !== undefined && data.documentCount > 1) {
      customizedMessage = `${data.documentCount} documents need your attention! ${customizedMessage}`;
    }

    return { ...baseMessage, message: customizedMessage };
  }

  return baseMessage;
}
