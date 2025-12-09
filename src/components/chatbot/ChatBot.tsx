import { useState, useRef, useEffect, useCallback } from "react";
import { MessageCircle, X, Send, Loader2, Upload, FileText, Image as ImageIcon, Camera, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/components/ui/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate, useLocation } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/useAuth";

interface Message {
  role: 'user' | 'assistant' | 'tool';
  content: string;
  tool_calls?: any[];
  tool_call_id?: string;
  files?: File[];
}

interface ToolExecution {
  name: string;
  status: 'pending' | 'success' | 'error';
  result?: string;
}

interface PendingConfirmation {
  type: 'delete_task' | 'delete_document' | 'update_task' | 'update_document';
  record: any;
  action: string;
  args?: any;
}

// Name resolver - finds records by name using fuzzy matching
async function resolveTaskByName(searchName: string): Promise<{ found: any[]; exactMatch: any | null }> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { found: [], exactMatch: null };

  const { data: tasks } = await supabase
    .from('tasks')
    .select('id, title, task_date, start_time, status, description')
    .eq('user_id', user.id)
    .ilike('title', `%${searchName}%`)
    .limit(10);

  if (!tasks || tasks.length === 0) return { found: [], exactMatch: null };
  
  const exactMatch = tasks.find(t => t.title.toLowerCase() === searchName.toLowerCase());
  return { found: tasks, exactMatch: exactMatch || (tasks.length === 1 ? tasks[0] : null) };
}

async function resolveDocumentByName(searchName: string): Promise<{ found: any[]; exactMatch: any | null }> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { found: [], exactMatch: null };

  const { data: docs } = await supabase
    .from('documents')
    .select('id, name, document_type, expiry_date, issuing_authority')
    .eq('user_id', user.id)
    .ilike('name', `%${searchName}%`)
    .limit(10);

  if (!docs || docs.length === 0) return { found: [], exactMatch: null };
  
  const exactMatch = docs.find(d => d.name.toLowerCase() === searchName.toLowerCase());
  return { found: docs, exactMatch: exactMatch || (docs.length === 1 ? docs[0] : null) };
}

export function ChatBot() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content: 'Hi! I\'m your AI agent. I can navigate the app, manage your documents & tasks by name, update settings, and more. Just tell me what you need!\n\nTry saying:\n• "Delete my task gym workout"\n• "Update passport expiry to Dec 21"\n• "Create a task for meeting at 4pm tomorrow"'
    }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [toolExecutions, setToolExecutions] = useState<ToolExecution[]>([]);
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [showUploadOptions, setShowUploadOptions] = useState(false);
  const [pendingConfirmation, setPendingConfirmation] = useState<PendingConfirmation | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  
  const isAuthPage = location.pathname === '/auth' || location.pathname === '/reset-password';
  const shouldShow = !isAuthPage && user;

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, toolExecutions]);

  // Trigger notification refresh after task creation/update
  const triggerNotificationRefresh = useCallback(async (taskId: string) => {
    try {
      await supabase.functions.invoke('task-two-hour-reminder', {
        body: { taskId }
      });
    } catch (error) {
      console.warn('Notification refresh failed:', error);
    }
  }, []);

  const executeTool = useCallback(async (toolName: string, args: any): Promise<string> => {
    try {
      switch (toolName) {
        case 'navigate': {
          let targetPath = args.page;
          if (args.filter && args.page === '/documents') {
            const statusMap: Record<string, string> = {
              'valid': 'valid', 'expiring': 'expiring', 'expired': 'expired', 'all': 'all',
              'license': 'license', 'passport': 'passport', 'permit': 'permit',
              'insurance': 'insurance', 'certification': 'certification',
              'tickets_and_fines': 'tickets_and_fines', 'other': 'other'
            };
            const mappedFilter = statusMap[args.filter] || args.filter;
            targetPath = `${args.page}?status=${mappedFilter}`;
          } else if (args.filter) {
            targetPath = `${args.page}?filter=${args.filter}`;
          }
          navigate(targetPath);
          setIsOpen(false);
          return `Navigated to ${args.page}${args.filter ? ` with filter: ${args.filter}` : ''}`;
        }

        case 'get_documents': {
          const { data: docs } = await supabase
            .from('documents')
            .select('id, name, document_type, expiry_date, issuing_authority')
            .order('expiry_date', { ascending: true })
            .limit(args.limit || 20);
          return `Found ${docs?.length || 0} documents: ${JSON.stringify(docs?.map(d => ({ id: d.id, name: d.name, type: d.document_type, expiry: d.expiry_date })))}`;
        }

        case 'find_document_by_name': {
          const result = await resolveDocumentByName(args.search_name);
          if (result.found.length === 0) {
            return `No documents found matching "${args.search_name}". Please check the name and try again.`;
          }
          if (result.exactMatch) {
            return `Found document: ${JSON.stringify(result.exactMatch)}`;
          }
          return `Found ${result.found.length} matching documents: ${JSON.stringify(result.found)}. Please specify which one you mean.`;
        }

        case 'find_task_by_name': {
          const result = await resolveTaskByName(args.search_name);
          if (result.found.length === 0) {
            return `No tasks found matching "${args.search_name}". Please check the name and try again.`;
          }
          if (result.exactMatch) {
            return `Found task: ${JSON.stringify(result.exactMatch)}`;
          }
          return `Found ${result.found.length} matching tasks: ${JSON.stringify(result.found)}. Please specify which one you mean.`;
        }

        case 'create_document': {
          const { data: { user } } = await supabase.auth.getUser();
          if (!user) return 'Error: User not authenticated';
          
          const { data: newDoc, error: createError } = await supabase
            .from('documents')
            .insert({
              user_id: user.id,
              name: args.name,
              document_type: args.document_type,
              expiry_date: args.expiry_date,
              issuing_authority: args.issuing_authority,
              category_detail: args.category_detail,
              notes: args.notes
            })
            .select()
            .single();
            
          if (createError) return `Error: ${createError.message}`;
          toast({ title: "Document created", description: args.name });
          return `Created document: ${newDoc.name} (ID: ${newDoc.id})`;
        }

        case 'update_document_by_name': {
          const result = await resolveDocumentByName(args.search_name);
          if (result.found.length === 0) {
            return `No documents found matching "${args.search_name}". Cannot update.`;
          }
          if (!result.exactMatch) {
            return `Multiple documents found: ${result.found.map(d => d.name).join(', ')}. Please be more specific.`;
          }
          
          // Set pending confirmation for destructive action
          setPendingConfirmation({
            type: 'update_document',
            record: result.exactMatch,
            action: `Update "${result.exactMatch.name}"`,
            args: { ...args, document_id: result.exactMatch.id }
          });
          
          return `CONFIRMATION_REQUIRED: Found document "${result.exactMatch.name}" (expires: ${result.exactMatch.expiry_date}). Do you want to update it? Reply "yes" to confirm or "no" to cancel.`;
        }

        case 'update_document': {
          const updateData: any = {};
          if (args.name) updateData.name = args.name;
          if (args.expiry_date) updateData.expiry_date = args.expiry_date;
          if (args.issuing_authority) updateData.issuing_authority = args.issuing_authority;
          if (args.category_detail) updateData.category_detail = args.category_detail;
          if (args.notes) updateData.notes = args.notes;
          
          const { error: updateError } = await supabase
            .from('documents')
            .update(updateData)
            .eq('id', args.document_id);
            
          if (updateError) return `Error: ${updateError.message}`;
          toast({ title: "Document updated" });
          return `Updated document successfully`;
        }

        case 'delete_document_by_name': {
          const result = await resolveDocumentByName(args.search_name);
          if (result.found.length === 0) {
            return `No documents found matching "${args.search_name}". Cannot delete.`;
          }
          if (!result.exactMatch) {
            return `Multiple documents found: ${result.found.map(d => `"${d.name}"`).join(', ')}. Please be more specific about which one to delete.`;
          }
          
          setPendingConfirmation({
            type: 'delete_document',
            record: result.exactMatch,
            action: `Delete "${result.exactMatch.name}"`,
            args: { document_id: result.exactMatch.id }
          });
          
          return `CONFIRMATION_REQUIRED: I found document "${result.exactMatch.name}" (${result.exactMatch.document_type}, expires: ${result.exactMatch.expiry_date}). Are you sure you want to delete it? Reply "yes" to confirm or "no" to cancel.`;
        }

        case 'delete_document': {
          const { error: deleteError } = await supabase
            .from('documents')
            .delete()
            .eq('id', args.document_id);
            
          if (deleteError) return `Error: ${deleteError.message}`;
          toast({ title: "Document deleted" });
          return `Deleted document successfully`;
        }

        case 'get_tasks': {
          const { data: tasks } = await supabase
            .from('tasks')
            .select('id, title, task_date, start_time, status, description')
            .order('task_date', { ascending: true });
          return `Found ${tasks?.length || 0} tasks: ${JSON.stringify(tasks?.map(t => ({ id: t.id, title: t.title, date: t.task_date, status: t.status })))}`;
        }

        case 'create_task': {
          const { data: { user: taskUser } } = await supabase.auth.getUser();
          if (!taskUser) return 'Error: User not authenticated';
          
          const { data: profile } = await supabase
            .from('profiles')
            .select('timezone')
            .eq('user_id', taskUser.id)
            .single();
          
          const timezone = profile?.timezone || 'UTC';
          const taskDate = new Date(`${args.task_date}T${args.start_time}:00`);
          
          const { data: newTask, error: taskError } = await supabase
            .from('tasks')
            .insert({
              user_id: taskUser.id,
              title: args.title,
              description: args.description,
              task_date: args.task_date,
              original_date: args.task_date,
              start_time: taskDate.toISOString(),
              end_time: args.end_time ? new Date(`${args.task_date}T${args.end_time}:00`).toISOString() : null,
              timezone: timezone,
              status: 'pending'
            })
            .select()
            .single();
            
          if (taskError) return `Error: ${taskError.message}`;
          
          // Trigger notification scheduling
          await triggerNotificationRefresh(newTask.id);
          
          toast({ title: "Task created", description: args.title });
          return `Created task: ${newTask.title} for ${args.task_date} at ${args.start_time}. Notifications scheduled.`;
        }

        case 'update_task_by_name': {
          const result = await resolveTaskByName(args.search_name);
          if (result.found.length === 0) {
            return `No tasks found matching "${args.search_name}". Cannot update.`;
          }
          if (!result.exactMatch) {
            return `Multiple tasks found: ${result.found.map(t => `"${t.title}"`).join(', ')}. Please be more specific.`;
          }
          
          setPendingConfirmation({
            type: 'update_task',
            record: result.exactMatch,
            action: `Update "${result.exactMatch.title}"`,
            args: { ...args, task_id: result.exactMatch.id, task_date: args.task_date || result.exactMatch.task_date }
          });
          
          return `CONFIRMATION_REQUIRED: Found task "${result.exactMatch.title}" (${result.exactMatch.task_date}, status: ${result.exactMatch.status}). Do you want to update it? Reply "yes" to confirm or "no" to cancel.`;
        }

        case 'update_task': {
          const taskUpdateData: any = {};
          if (args.title) taskUpdateData.title = args.title;
          if (args.description !== undefined) taskUpdateData.description = args.description;
          if (args.task_date) taskUpdateData.task_date = args.task_date;
          if (args.start_time) {
            const date = args.task_date || new Date().toISOString().split('T')[0];
            const updatedStartTime = new Date(`${date}T${args.start_time}:00`);
            taskUpdateData.start_time = updatedStartTime.toISOString();
          }
          if (args.end_time) {
            const date = args.task_date || new Date().toISOString().split('T')[0];
            const updatedEndTime = new Date(`${date}T${args.end_time}:00`);
            taskUpdateData.end_time = updatedEndTime.toISOString();
          }
          if (args.status) taskUpdateData.status = args.status;
          
          const { error: taskUpdateError } = await supabase
            .from('tasks')
            .update(taskUpdateData)
            .eq('id', args.task_id);
            
          if (taskUpdateError) return `Error: ${taskUpdateError.message}`;
          
          // Trigger notification refresh
          await triggerNotificationRefresh(args.task_id);
          
          toast({ title: "Task updated" });
          return `Updated task successfully. Notifications rescheduled.`;
        }

        case 'delete_task_by_name': {
          const result = await resolveTaskByName(args.search_name);
          if (result.found.length === 0) {
            return `No tasks found matching "${args.search_name}". Cannot delete.`;
          }
          if (!result.exactMatch) {
            return `Multiple tasks found: ${result.found.map(t => `"${t.title}"`).join(', ')}. Please be more specific about which one to delete.`;
          }
          
          setPendingConfirmation({
            type: 'delete_task',
            record: result.exactMatch,
            action: `Delete "${result.exactMatch.title}"`,
            args: { task_id: result.exactMatch.id }
          });
          
          return `CONFIRMATION_REQUIRED: I found task "${result.exactMatch.title}" (${result.exactMatch.task_date}, status: ${result.exactMatch.status}). Are you sure you want to delete it? Reply "yes" to confirm or "no" to cancel.`;
        }

        case 'delete_task': {
          const { error: taskDeleteError } = await supabase
            .from('tasks')
            .delete()
            .eq('id', args.task_id);
            
          if (taskDeleteError) return `Error: ${taskDeleteError.message}`;
          toast({ title: "Task deleted" });
          return `Deleted task successfully`;
        }

        case 'update_profile': {
          const { data: { user: profileUser } } = await supabase.auth.getUser();
          if (!profileUser) return 'Error: User not authenticated';
          
          const profileUpdates: any = {};
          if (args.display_name) profileUpdates.display_name = args.display_name;
          if (args.country) profileUpdates.country = args.country;
          if (args.timezone) profileUpdates.timezone = args.timezone;
          if (args.push_notifications_enabled !== undefined) profileUpdates.push_notifications_enabled = args.push_notifications_enabled;
          if (args.email_notifications_enabled !== undefined) profileUpdates.email_notifications_enabled = args.email_notifications_enabled;
          
          const { error: profileError } = await supabase
            .from('profiles')
            .update(profileUpdates)
            .eq('user_id', profileUser.id);
            
          if (profileError) return `Error: ${profileError.message}`;
          toast({ title: "Profile updated" });
          return `Updated profile settings`;
        }

        case 'move_to_docvault': {
          const { error: vaultError } = await supabase
            .from('documents')
            .update({ 
              expiry_date: '9999-12-31',
              notes: `Moved to DocVault on ${new Date().toISOString().split('T')[0]}`
            })
            .eq('id', args.document_id);
            
          if (vaultError) return `Error: ${vaultError.message}`;
          toast({ title: "Moved to DocVault", description: "Document is now permanent" });
          return `Moved document to DocVault`;
        }

        case 'trigger_upload': {
          setIsOpen(false);
          navigate('/scan');
          toast({ 
            title: "Upload mode activated", 
            description: `Ready for ${args.type} upload` 
          });
          return `Navigated to scan page for ${args.type} upload`;
        }

        default:
          return `Unknown tool: ${toolName}`;
      }
    } catch (error: any) {
      return `Error executing ${toolName}: ${error.message}`;
    }
  }, [navigate, toast, triggerNotificationRefresh]);

  // Handle confirmation responses
  const handleConfirmation = useCallback(async (confirmed: boolean) => {
    if (!pendingConfirmation) return;
    
    if (confirmed) {
      const { type, args } = pendingConfirmation;
      let result = '';
      
      if (type === 'delete_task') {
        result = await executeTool('delete_task', args);
      } else if (type === 'delete_document') {
        result = await executeTool('delete_document', args);
      } else if (type === 'update_task') {
        result = await executeTool('update_task', args);
      } else if (type === 'update_document') {
        result = await executeTool('update_document', args);
      }
      
      setMessages(prev => [...prev, { role: 'assistant', content: result }]);
    } else {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Action cancelled.' }]);
    }
    
    setPendingConfirmation(null);
  }, [pendingConfirmation, executeTool]);

  const streamChat = async (userMessage: string) => {
    // Check for confirmation response
    const lowerMsg = userMessage.toLowerCase().trim();
    if (pendingConfirmation) {
      if (lowerMsg === 'yes' || lowerMsg === 'confirm' || lowerMsg === 'y' || lowerMsg === 'ok') {
        setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
        setInput('');
        await handleConfirmation(true);
        return;
      } else if (lowerMsg === 'no' || lowerMsg === 'cancel' || lowerMsg === 'n' || lowerMsg === 'nevermind') {
        setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
        setInput('');
        await handleConfirmation(false);
        return;
      }
    }
    
    setIsLoading(true);
    
    const newMessages = [...messages, { role: 'user' as const, content: userMessage }];
    setMessages(newMessages);
    setInput('');

    setMessages(prev => [...prev, { role: 'assistant', content: '' }]);

    try {
      const CHAT_URL = 'https://rndunloczfpfbubuwffb.supabase.co/functions/v1/chatbot';
      
      const response = await fetch(CHAT_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJuZHVubG9jemZwZmJ1YnV3ZmZiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkxNDEyMjIsImV4cCI6MjA3NDcxNzIyMn0.DsiQcXrQKHVg1WDJjJ2aAuABv5O7KLd6-7lKxmKcDCM',
        },
        body: JSON.stringify({ messages: newMessages }),
      });

      if (!response.ok) {
        if (response.status === 429) {
          toast({
            title: "Rate Limit",
            description: "Too many requests. Please wait a moment.",
            variant: "destructive",
          });
          setMessages(prev => prev.slice(0, -1));
          return;
        }
        if (response.status === 402) {
          toast({
            title: "Service Unavailable",
            description: "AI service needs credits. Please try again later.",
            variant: "destructive",
          });
          setMessages(prev => prev.slice(0, -1));
          return;
        }
        throw new Error('Failed to get response');
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let assistantMessage = '';
      let pendingToolCalls: any[] = [];
      let currentToolCallIndex = -1;
      let currentToolCallArgs = '';

      if (reader) {
        let buffer = '';
        
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          
          buffer += decoder.decode(value, { stream: true });
          
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';
          
          for (let line of lines) {
            if (line.endsWith('\r')) line = line.slice(0, -1);
            if (line.startsWith(':') || line.trim() === '') continue;
            if (!line.startsWith('data: ')) continue;
            
            const jsonStr = line.slice(6).trim();
            if (jsonStr === '[DONE]') continue;
            
            try {
              const parsed = JSON.parse(jsonStr);
              const delta = parsed.choices?.[0]?.delta;
              
              if (delta?.content) {
                assistantMessage += delta.content;
                setMessages(prev => {
                  const updated = [...prev];
                  updated[updated.length - 1] = {
                    role: 'assistant',
                    content: assistantMessage
                  };
                  return updated;
                });
              }
              
              if (delta?.tool_calls) {
                for (const toolCall of delta.tool_calls) {
                  if (toolCall.index !== undefined) {
                    if (toolCall.index !== currentToolCallIndex) {
                      if (currentToolCallIndex >= 0 && currentToolCallArgs) {
                        try {
                          pendingToolCalls[currentToolCallIndex].function.arguments = JSON.parse(currentToolCallArgs);
                        } catch (e) {
                          console.warn('Failed to parse tool args:', currentToolCallArgs);
                        }
                      }
                      currentToolCallIndex = toolCall.index;
                      currentToolCallArgs = '';
                      
                      if (!pendingToolCalls[toolCall.index]) {
                        pendingToolCalls[toolCall.index] = {
                          id: toolCall.id || `tool_${Date.now()}_${toolCall.index}`,
                          type: 'function',
                          function: {
                            name: toolCall.function?.name || '',
                            arguments: ''
                          }
                        };
                      }
                    }
                    
                    if (toolCall.function?.name) {
                      pendingToolCalls[currentToolCallIndex].function.name = toolCall.function.name;
                    }
                    if (toolCall.function?.arguments) {
                      currentToolCallArgs += toolCall.function.arguments;
                    }
                  }
                }
              }
            } catch (e) {
              console.warn('Failed to parse chunk:', e);
            }
          }
        }
        
        if (currentToolCallIndex >= 0 && currentToolCallArgs) {
          try {
            pendingToolCalls[currentToolCallIndex].function.arguments = JSON.parse(currentToolCallArgs);
          } catch (e) {
            console.warn('Failed to parse final tool args:', currentToolCallArgs);
          }
        }
        
        if (pendingToolCalls.length > 0) {
          setToolExecutions(pendingToolCalls.map(tc => ({
            name: tc.function.name,
            status: 'pending'
          })));
          
          for (const toolCall of pendingToolCalls) {
            const result = await executeTool(
              toolCall.function.name,
              toolCall.function.arguments
            );
            
            // If result requires confirmation, update the message
            if (result.includes('CONFIRMATION_REQUIRED:')) {
              const confirmMessage = result.replace('CONFIRMATION_REQUIRED: ', '');
              setMessages(prev => {
                const updated = [...prev];
                updated[updated.length - 1] = {
                  role: 'assistant',
                  content: confirmMessage
                };
                return updated;
              });
            }
            
            setToolExecutions(prev => 
              prev.map(te => 
                te.name === toolCall.function.name 
                  ? { ...te, status: 'success', result }
                  : te
              )
            );
          }
          
          setTimeout(() => setToolExecutions([]), 2000);
        }
      }
    } catch (error) {
      console.error('Chat error:', error);
      toast({
        title: "Error",
        description: "Failed to get response. Please try again.",
        variant: "destructive",
      });
      setMessages(prev => prev.slice(0, -1));
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const validFiles = files.filter(file => {
      const isImage = file.type.startsWith('image/');
      const isPDF = file.type === 'application/pdf';
      return isImage || isPDF;
    });

    if (validFiles.length < files.length) {
      toast({
        title: "Invalid files",
        description: "Only images and PDFs are supported",
        variant: "destructive",
      });
    }

    setUploadedFiles(prev => [...prev, ...validFiles]);
  };

  const removeFile = (index: number) => {
    setUploadedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleSend = () => {
    if ((!input.trim() && uploadedFiles.length === 0) || isLoading) return;
    
    const message = uploadedFiles.length > 0 
      ? `${input.trim() || 'I want to upload these documents'}\n\nFiles attached: ${uploadedFiles.map(f => f.name).join(', ')}`
      : input.trim();
    
    streamChat(message);
    setUploadedFiles([]);
    setShowUploadOptions(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleUploadOption = (type: string) => {
    setShowUploadOptions(false);
    if (type === 'manual') {
      setInput('I want to add a document manually');
      streamChat('I want to add a document manually');
    } else {
      navigate('/scan');
      setIsOpen(false);
      toast({
        title: "Upload mode",
        description: `Navigate to scan page for ${type} upload`
      });
    }
  };

  if (!shouldShow) return null;

  return (
    <>
      <Button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed right-4 md:right-6 h-12 w-12 md:h-14 md:w-14 rounded-full shadow-lg z-50"
        style={{ bottom: 'calc(6rem + env(safe-area-inset-bottom))' }}
        size="icon"
      >
        {isOpen ? <X className="h-5 w-5 md:h-6 md:w-6" /> : <MessageCircle className="h-5 w-5 md:h-6 md:w-6" />}
      </Button>

      {isOpen && (
        <Card 
          className="fixed inset-x-2 md:right-6 md:left-auto md:w-96 h-[calc(100vh-200px)] md:h-[500px] max-h-[500px] shadow-2xl z-50 flex flex-col w-full rounded-2xl"
          style={{ bottom: 'calc(7.5rem + env(safe-area-inset-bottom))' }}
        >
          <div className="flex items-center justify-between p-3 md:p-4 border-b bg-primary/5">
            <div className="flex items-center gap-2">
              <MessageCircle className="h-4 w-4 md:h-5 md:w-5 text-primary" />
              <h3 className="font-semibold text-sm md:text-base">AI Agent</h3>
              {toolExecutions.length > 0 && (
                <Badge variant="secondary" className="text-xs">
                  <Loader2 className="h-3 w-3 animate-spin mr-1" />
                  Working...
                </Badge>
              )}
              {pendingConfirmation && (
                <Badge variant="destructive" className="text-xs">
                  <AlertTriangle className="h-3 w-3 mr-1" />
                  Confirm
                </Badge>
              )}
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsOpen(false)}
              className="hover:bg-destructive/10 h-8 w-8 md:h-9 md:w-9"
            >
              <X className="h-4 w-4 md:h-5 md:w-5" />
            </Button>
          </div>

          <ScrollArea className="flex-1 p-3 md:p-4" ref={scrollRef}>
            <div className="space-y-3 md:space-y-4">
              {messages.map((message, index) => (
                <div
                  key={index}
                  className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[85%] md:max-w-[80%] rounded-lg px-3 py-2 md:px-4 md:py-2 ${
                      message.role === 'user'
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted'
                    }`}
                  >
                    <p className="text-xs md:text-sm whitespace-pre-wrap">{message.content}</p>
                  </div>
                </div>
              ))}
              
              {toolExecutions.map((tool, idx) => (
                <div key={idx} className="flex justify-start">
                  <div className="bg-primary/10 rounded-lg px-3 py-2 md:px-4 md:py-2 flex items-center gap-2">
                    {tool.status === 'pending' && <Loader2 className="h-3 w-3 animate-spin" />}
                    {tool.status === 'success' && <span className="text-green-600">✓</span>}
                    <p className="text-xs md:text-sm font-medium">{tool.name}</p>
                  </div>
                </div>
              ))}
              
              {isLoading && toolExecutions.length === 0 && (
                <div className="flex justify-start">
                  <div className="bg-muted rounded-lg px-3 py-2 md:px-4 md:py-2">
                    <Loader2 className="h-3.5 w-3.5 md:h-4 md:w-4 animate-spin" />
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>

          <div className="p-3 md:p-4 border-t space-y-2">
            {showUploadOptions && (
              <div className="mb-2 p-3 bg-muted/50 rounded-lg space-y-2">
                <p className="text-xs font-medium text-muted-foreground mb-2">Choose upload type:</p>
                <div className="grid grid-cols-3 gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleUploadOption('pdf')}
                    className="flex flex-col h-auto py-2 gap-1"
                  >
                    <FileText className="h-4 w-4" />
                    <span className="text-xs">PDF</span>
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleUploadOption('image')}
                    className="flex flex-col h-auto py-2 gap-1"
                  >
                    <Camera className="h-4 w-4" />
                    <span className="text-xs">Image</span>
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleUploadOption('manual')}
                    className="flex flex-col h-auto py-2 gap-1"
                  >
                    <FileText className="h-4 w-4" />
                    <span className="text-xs">Manual</span>
                  </Button>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setShowUploadOptions(false)}
                  className="w-full text-xs"
                >
                  Cancel
                </Button>
              </div>
            )}

            {uploadedFiles.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-2">
                {uploadedFiles.map((file, idx) => (
                  <div key={idx} className="flex items-center gap-1 bg-muted rounded px-2 py-1 text-xs">
                    {file.type.startsWith('image/') ? (
                      <ImageIcon className="h-3 w-3" />
                    ) : (
                      <FileText className="h-3 w-3" />
                    )}
                    <span className="max-w-[100px] truncate">{file.name}</span>
                    <button
                      onClick={() => removeFile(idx)}
                      className="ml-1 hover:text-destructive"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            
            <div className="flex gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,application/pdf"
                multiple
                onChange={handleFileUpload}
                className="hidden"
              />
              <Button
                onClick={() => setShowUploadOptions(!showUploadOptions)}
                disabled={isLoading}
                variant="outline"
                size="icon"
                className="shrink-0 h-9 w-9 md:h-10 md:w-10"
                title="Upload options"
              >
                <Upload className="h-3.5 w-3.5 md:h-4 md:w-4" />
              </Button>
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={pendingConfirmation ? "Type 'yes' to confirm or 'no' to cancel..." : "Ask me anything..."}
                className="min-h-[40px] max-h-[120px] text-xs md:text-sm resize-none"
                rows={1}
                disabled={isLoading}
              />
              <Button
                onClick={handleSend}
                disabled={isLoading || (!input.trim() && uploadedFiles.length === 0)}
                size="icon"
                className="shrink-0 h-9 w-9 md:h-10 md:w-10"
              >
                <Send className="h-3.5 w-3.5 md:h-4 md:w-4" />
              </Button>
            </div>
          </div>
        </Card>
      )}
    </>
  );
}
