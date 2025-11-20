import React, { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import { toast } from '@/hooks/use-toast';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Trash2, AlertTriangle } from 'lucide-react';

interface DeleteAccountDialogProps {
  children: React.ReactNode;
}

export function DeleteAccountDialog({ children }: DeleteAccountDialogProps) {
  const { user, deleteAccount } = useAuth();
  const navigate = useNavigate();
  const [confirmText, setConfirmText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);

  const userEmail = user?.email || '';
  const expectedText = `DELETE ${userEmail}`;

  const handleDeleteAccount = async () => {
    if (confirmText !== expectedText) {
      toast({
        title: "Invalid confirmation",
        description: "Please type the exact confirmation text to delete your account.",
        variant: "destructive",
      });
      return;
    }

    setIsDeleting(true);
    try {
      await deleteAccount();
      
      toast({
        title: "Account deleted",
        description: "Your account and all data have been permanently deleted.",
      });
      
      navigate('/auth');
    } catch (error: any) {
      console.error('Error deleting account:', error);
      toast({
        title: "Delete failed",
        description: error?.message || "Failed to delete account. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
      setShowConfirmDialog(false);
      setConfirmText('');
    }
  };

  return (
    <AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
      <AlertDialogTrigger asChild>
        {children}
      </AlertDialogTrigger>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            Delete Account
          </AlertDialogTitle>
          <AlertDialogDescription className="space-y-3">
            <div>
              <p className="font-semibold text-foreground mb-2">
                This action cannot be undone.
              </p>
              <p>
                Deleting your account will permanently remove:
              </p>
            </div>
            <ul className="list-disc pl-5 space-y-1 text-sm">
              <li>All your documents and data</li>
              <li>Your profile information</li>
              <li>All reminders and notifications</li>
              <li>Your account access</li>
            </ul>
            <div className="pt-2">
              <Label htmlFor="confirm-delete" className="text-sm font-medium">
                Type <span className="font-mono bg-muted px-1 rounded">{expectedText}</span> to confirm:
              </Label>
              <Input
                id="confirm-delete"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder={expectedText}
                className="mt-1"
              />
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => {
            setConfirmText('');
            setShowConfirmDialog(false);
          }}>
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDeleteAccount}
            disabled={confirmText !== expectedText || isDeleting}
            className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
          >
            {isDeleting ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                Deleting...
              </>
            ) : (
              <>
                <Trash2 className="h-4 w-4 mr-2" />
                Delete Account
              </>
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
