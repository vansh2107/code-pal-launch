# 🤖 AI Agent Guide - Remonk Reminder

Your chatbot is now a **comprehensive AI agent** that can control the entire app through natural language.

## ✨ What It Can Do

### 📱 Navigation
- "Open my documents"
- "Show expired documents"
- "Go to tasks page"
- "Open my profile"
- "Show me docvault"

### 📄 Document Management
- **Create**: "Add a new passport document expiring on 2026-01-15"
- **Read**: "Show me all my expired documents"
- **Update**: "Update document [ID] to expire on 2027-03-20"
- **Delete**: "Delete document [ID]"
- **Filter**: "Show me all license documents" or "Show valid insurance docs"

### ✅ Task Management
- **Create**: "Create a task 'Buy groceries' for tomorrow at 3 PM"
- **View**: "Show me today's tasks"
- **Manage**: Full CRUD operations on tasks

### ⚙️ Profile Updates
- "Change my timezone to America/New_York"
- "Update my country to Canada"
- "Enable push notifications"
- "Turn off email notifications"

### 📤 Document Upload
- "I want to upload a PDF document"
- "Upload images"
- "Add a document manually"

## 🎯 How It Works

1. **Tool Calling**: The AI uses function calling to execute actions
2. **Real-time Execution**: Actions happen immediately with visual feedback
3. **Streaming**: Responses stream in real-time
4. **Context Aware**: Knows your current documents and data

## 🚫 Hidden on Auth Pages

The chatbot automatically hides on:
- `/auth` (Sign in/Sign up)
- `/reset-password`

## 💡 Example Conversations

**User**: "Show me all my expired documents"
**Agent**: *Navigates to /documents with expired filter* → "I've filtered to show your expired documents"

**User**: "Create a task for grocery shopping tomorrow at 2 PM"
**Agent**: *Creates task* → "Created task: grocery shopping for [tomorrow's date] at 14:00"

**User**: "Upload a new passport"
**Agent**: *Navigates to /scan* → "Ready to scan your passport!"

## 🔧 Technical Details

### Backend (Edge Function)
- Location: `supabase/functions/chatbot/index.ts`
- Uses Lovable AI (google/gemini-2.5-flash)
- 10 comprehensive tools for app control
- Streaming responses with tool calling

### Frontend (ChatBot Component)
- Location: `src/components/chatbot/ChatBot.tsx`
- Executes tools: navigation, CRUD, profile updates
- Visual feedback with badges and status indicators
- Responsive design with safe-area support

## 🎨 UI Features

- **Status Badge**: Shows "Working..." when executing tools
- **Tool Execution Indicators**: Visual checkmarks for completed actions
- **Smooth Animations**: Tool execution animations
- **Toast Notifications**: Confirms actions (document created, profile updated, etc.)

## 🔐 Security

- JWT authentication required (verify_jwt = true)
- User context automatically loaded
- All operations respect RLS policies
- Input sanitization on backend

## 📱 Mobile Ready

- Responsive design
- Safe-area padding for notched devices
- Bottom navigation consideration
- Touch-optimized controls

---

**Pro Tip**: The AI agent thinks and reasons. Try complex requests like "Show me expired licenses and help me understand renewal requirements" - it will break down the task and execute multiple operations!
