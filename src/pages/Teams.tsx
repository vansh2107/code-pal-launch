import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { BottomNavigation } from "@/components/layout/BottomNavigation";
import { Users, Plus, Trash2, Settings, UserPlus } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

type Organization = {
  id: string;
  name: string;
  created_at: string;
  owner_id: string;
};

type OrganizationMember = {
  id: string;
  user_id: string;
  role: 'admin' | 'editor' | 'viewer';
  created_at: string;
  profiles?: {
    display_name: string | null;
  };
};

export default function Teams() {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [selectedOrg, setSelectedOrg] = useState<string | null>(null);
  const [members, setMembers] = useState<OrganizationMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [orgToDelete, setOrgToDelete] = useState<string | null>(null);
  const [newOrgName, setNewOrgName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<'admin' | 'editor' | 'viewer'>('viewer');

  useEffect(() => {
    if (user) {
      fetchOrganizations();
    }
  }, [user]);

  useEffect(() => {
    if (selectedOrg) {
      fetchMembers(selectedOrg);
    }
  }, [selectedOrg]);

  const fetchOrganizations = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('organizations')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      toast({
        title: "Error",
        description: "Failed to load organizations",
        variant: "destructive",
      });
    } else {
      setOrganizations(data || []);
      if (data && data.length > 0 && !selectedOrg) {
        setSelectedOrg(data[0].id);
      }
    }
    setLoading(false);
  };

  const fetchMembers = async (orgId: string) => {
    const { data, error } = await supabase
      .from('organization_members')
      .select('*')
      .eq('organization_id', orgId)
      .order('created_at', { ascending: true });

    if (error) {
      console.error("Error fetching members:", error);
      toast({
        title: "Error",
        description: "Failed to load team members",
        variant: "destructive",
      });
      return;
    }

    // Fetch profiles separately
    const userIds = data?.map(m => m.user_id) || [];
    if (userIds.length === 0) {
      setMembers([]);
      return;
    }

    const { data: profiles } = await supabase
      .from('profiles')
      .select('user_id, display_name')
      .in('user_id', userIds);

    const membersWithProfiles = data?.map(member => ({
      ...member,
      profiles: profiles?.find(p => p.user_id === member.user_id) || null
    })) || [];

    setMembers(membersWithProfiles);
  };

  const createOrganization = async () => {
    if (!newOrgName.trim() || !user) return;

    const { data: org, error: orgError } = await supabase
      .from('organizations')
      .insert([{ name: newOrgName, owner_id: user.id }])
      .select()
      .single();

    if (orgError) {
      toast({
        title: "Error",
        description: "Failed to create organization",
        variant: "destructive",
      });
      return;
    }

    // Add creator as admin member
    const { error: memberError } = await supabase
      .from('organization_members')
      .insert([{ organization_id: org.id, user_id: user.id, role: 'admin' }]);

    if (memberError) {
      console.error("Error adding creator as member:", memberError);
    }

    toast({
      title: "Success",
      description: "Organization created successfully",
    });

    setNewOrgName("");
    setCreateDialogOpen(false);
    fetchOrganizations();
  };

  const inviteMember = async () => {
    if (!inviteEmail.trim() || !selectedOrg) return;

    // Find user by email through auth.users (we need to use an edge function or admin API for this in production)
    // For now, we'll show a more helpful error message
    toast({
      title: "Feature Not Available",
      description: "Email-based invites require additional setup. Please share your organization ID with users to join.",
      variant: "destructive",
    });
    return;

    const { error } = await supabase
      .from('organization_members')
      .insert([{
        organization_id: selectedOrg,
        user_id: inviteEmail, // In production, this would need proper user lookup
        role: inviteRole
      }]);

    if (error) {
      if (error.code === '23505') { // Unique constraint violation
        toast({
          title: "Error",
          description: "User is already a member of this organization",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Error",
          description: "Failed to invite member",
          variant: "destructive",
        });
      }
      return;
    }

    toast({
      title: "Success",
      description: "Member invited successfully",
    });

    setInviteEmail("");
    setInviteRole('viewer');
    setInviteDialogOpen(false);
    fetchMembers(selectedOrg);
  };

  const updateMemberRole = async (memberId: string, newRole: 'admin' | 'editor' | 'viewer') => {
    const { error } = await supabase
      .from('organization_members')
      .update({ role: newRole })
      .eq('id', memberId);

    if (error) {
      toast({
        title: "Error",
        description: "Failed to update member role",
        variant: "destructive",
      });
    } else {
      toast({
        title: "Success",
        description: "Member role updated",
      });
      if (selectedOrg) {
        fetchMembers(selectedOrg);
      }
    }
  };

  const removeMember = async (memberId: string) => {
    const { error } = await supabase
      .from('organization_members')
      .delete()
      .eq('id', memberId);

    if (error) {
      toast({
        title: "Error",
        description: "Failed to remove member",
        variant: "destructive",
      });
    } else {
      toast({
        title: "Success",
        description: "Member removed from organization",
      });
      if (selectedOrg) {
        fetchMembers(selectedOrg);
      }
    }
  };

  const deleteOrganization = async () => {
    if (!orgToDelete) return;

    const { error } = await supabase
      .from('organizations')
      .delete()
      .eq('id', orgToDelete);

    if (error) {
      toast({
        title: "Error",
        description: "Failed to delete organization",
        variant: "destructive",
      });
    } else {
      toast({
        title: "Success",
        description: "Organization deleted",
      });
      setDeleteDialogOpen(false);
      setOrgToDelete(null);
      setSelectedOrg(null);
      fetchOrganizations();
    }
  };

  const selectedOrgData = organizations.find(org => org.id === selectedOrg);
  const isOwner = selectedOrgData?.owner_id === user?.id;

  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background pb-20">
      <div className="container mx-auto px-4 py-6 max-w-6xl">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Team Management</h1>
            <p className="text-muted-foreground mt-1">Manage organizations and team members</p>
          </div>
          <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Create Organization
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create Organization</DialogTitle>
                <DialogDescription>
                  Create a new organization to collaborate with your team
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="org-name">Organization Name</Label>
                  <Input
                    id="org-name"
                    placeholder="My Company"
                    value={newOrgName}
                    onChange={(e) => setNewOrgName(e.target.value)}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={createOrganization} disabled={!newOrgName.trim()}>
                  Create
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {loading ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground">Loading...</p>
          </div>
        ) : organizations.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Users className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No Organizations</h3>
              <p className="text-muted-foreground mb-4">
                Create your first organization to start collaborating with your team
              </p>
              <Button onClick={() => setCreateDialogOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Create Organization
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-6 md:grid-cols-3">
            <div className="space-y-2">
              <h2 className="text-lg font-semibold">Organizations</h2>
              {organizations.map((org) => (
                <Card
                  key={org.id}
                  className={`cursor-pointer transition-colors ${
                    selectedOrg === org.id ? 'border-primary bg-accent' : ''
                  }`}
                  onClick={() => setSelectedOrg(org.id)}
                >
                  <CardHeader className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="text-base">{org.name}</CardTitle>
                        {org.owner_id === user?.id && (
                          <Badge variant="secondary" className="mt-1">Owner</Badge>
                        )}
                      </div>
                      {org.owner_id === user?.id && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={(e) => {
                            e.stopPropagation();
                            setOrgToDelete(org.id);
                            setDeleteDialogOpen(true);
                          }}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      )}
                    </div>
                  </CardHeader>
                </Card>
              ))}
            </div>

            <div className="md:col-span-2">
              {selectedOrg && (
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle>Team Members</CardTitle>
                        <CardDescription>
                          Manage roles and permissions for {selectedOrgData?.name}
                        </CardDescription>
                      </div>
                      {isOwner && (
                        <Dialog open={inviteDialogOpen} onOpenChange={setInviteDialogOpen}>
                          <DialogTrigger asChild>
                            <Button>
                              <UserPlus className="h-4 w-4 mr-2" />
                              Invite Member
                            </Button>
                          </DialogTrigger>
                          <DialogContent>
                            <DialogHeader>
                              <DialogTitle>Invite Team Member</DialogTitle>
                              <DialogDescription>
                                Invite a user to join your organization by their email
                              </DialogDescription>
                            </DialogHeader>
                            <div className="space-y-4 py-4">
                              <div className="space-y-2">
                                <Label htmlFor="email">Email Address</Label>
                                <Input
                                  id="email"
                                  type="email"
                                  placeholder="user@example.com"
                                  value={inviteEmail}
                                  onChange={(e) => setInviteEmail(e.target.value)}
                                />
                              </div>
                              <div className="space-y-2">
                                <Label htmlFor="role">Role</Label>
                                <Select value={inviteRole} onValueChange={(value: any) => setInviteRole(value)}>
                                  <SelectTrigger>
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="viewer">Viewer - Can view documents</SelectItem>
                                    <SelectItem value="editor">Editor - Can edit documents</SelectItem>
                                    <SelectItem value="admin">Admin - Full access</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                            </div>
                            <DialogFooter>
                              <Button variant="outline" onClick={() => setInviteDialogOpen(false)}>
                                Cancel
                              </Button>
                              <Button onClick={inviteMember} disabled={!inviteEmail.trim()}>
                                Invite
                              </Button>
                            </DialogFooter>
                          </DialogContent>
                        </Dialog>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {members.map((member) => (
                        <div
                          key={member.id}
                          className="flex items-center justify-between p-3 rounded-lg border bg-card"
                        >
                          <div>
                            <p className="font-medium">
                              {member.profiles?.display_name || 'Unknown User'}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              User ID: {member.user_id.substring(0, 8)}...
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            {isOwner ? (
                              <>
                                <Select
                                  value={member.role}
                                  onValueChange={(value: any) => updateMemberRole(member.id, value)}
                                >
                                  <SelectTrigger className="w-[130px]">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="viewer">Viewer</SelectItem>
                                    <SelectItem value="editor">Editor</SelectItem>
                                    <SelectItem value="admin">Admin</SelectItem>
                                  </SelectContent>
                                </Select>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => removeMember(member.id)}
                                  disabled={member.user_id === user?.id}
                                >
                                  <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                              </>
                            ) : (
                              <Badge variant="secondary">{member.role}</Badge>
                            )}
                          </div>
                        </div>
                      ))}
                      {members.length === 0 && (
                        <p className="text-center text-muted-foreground py-8">
                          No members yet. Invite your first team member!
                        </p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        )}

        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Organization</AlertDialogTitle>
              <AlertDialogDescription>
                This action cannot be undone. This will permanently delete the organization
                and remove all associated data.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setOrgToDelete(null)}>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={deleteOrganization} className="bg-destructive text-destructive-foreground">
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
      <BottomNavigation />
    </div>
  );
}
