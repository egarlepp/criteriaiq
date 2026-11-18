/**
 * Recipient picker grouped by role, used by the workflow schedule editor
 * (report delivery recipients). Moved from Workflow Automation with the
 * schedule editor.
 */
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { Check, ChevronDown, ChevronRight, ChevronsUpDown, Users } from "lucide-react";

export function getUserDisplayName(user: any): string {
  if (user.firstName && user.lastName) {
    return `${user.firstName} ${user.lastName}`;
  }
  if (user.firstName) return user.firstName;
  if (user.lastName) return user.lastName;
  if (user.username) return user.username;
  return user.email || 'Unknown User';
}

interface RoleGroupedUserSelectorProps {
  usersData: any[];
  selectedRecipients: string[];
  onSelect: (email: string) => void;
  maxRecipients?: number;
}

export function RoleGroupedUserSelector({ 
  usersData, 
  selectedRecipients, 
  onSelect,
  maxRecipients = 10
}: RoleGroupedUserSelectorProps) {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedRoles, setExpandedRoles] = useState<Set<string>>(new Set());
  
  const usersByRole = useMemo(() => {
    const grouped: Record<string, any[]> = {};
    usersData.forEach((user: any) => {
      const role = user.role || 'Other';
      if (!grouped[role]) grouped[role] = [];
      grouped[role].push(user);
    });
    Object.keys(grouped).forEach(role => {
      grouped[role].sort((a, b) => getUserDisplayName(a).localeCompare(getUserDisplayName(b)));
    });
    return grouped;
  }, [usersData]);
  
  const filteredUsersByRole = useMemo(() => {
    if (!searchQuery.trim()) return usersByRole;
    const query = searchQuery.toLowerCase();
    const filtered: Record<string, any[]> = {};
    Object.entries(usersByRole).forEach(([role, users]) => {
      const matchingUsers = users.filter((user: any) => {
        const name = getUserDisplayName(user).toLowerCase();
        const email = (user.email || '').toLowerCase();
        return name.includes(query) || email.includes(query) || role.toLowerCase().includes(query);
      });
      if (matchingUsers.length > 0) filtered[role] = matchingUsers;
    });
    return filtered;
  }, [usersByRole, searchQuery]);
  
  const roleOrder = ['Admin', 'Engineer', 'Sales', 'Services', 'Support', 'CX', 'Product', 'Partner', 'Customer', 'Guest', 'Other'];
  const sortedRoles = Object.keys(filteredUsersByRole).sort((a, b) => {
    const aIdx = roleOrder.indexOf(a);
    const bIdx = roleOrder.indexOf(b);
    if (aIdx === -1 && bIdx === -1) return a.localeCompare(b);
    if (aIdx === -1) return 1;
    if (bIdx === -1) return -1;
    return aIdx - bIdx;
  });
  
  const toggleRole = (role: string) => {
    setExpandedRoles(prev => {
      const next = new Set(prev);
      if (next.has(role)) next.delete(role);
      else next.add(role);
      return next;
    });
  };
  
  const handleSelectUser = (email: string) => {
    onSelect(email);
    setOpen(false);
    setSearchQuery('');
  };
  
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between"
        >
          <span className="flex items-center gap-2 text-muted-foreground">
            <Users className="h-4 w-4" />
            Select recipients from users...
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[400px] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput 
            placeholder="Search users by name or email..." 
            value={searchQuery}
            onValueChange={setSearchQuery}
          />
          <CommandList className="max-h-[300px]">
            <CommandEmpty>No users found.</CommandEmpty>
            {sortedRoles.map((role) => (
              <div key={role}>
                <button
                  type="button"
                  className="flex items-center w-full px-2 py-1.5 text-sm font-medium text-muted-foreground hover:bg-muted/50 transition-colors"
                  onClick={() => toggleRole(role)}
                >
                  {expandedRoles.has(role) || searchQuery ? (
                    <ChevronDown className="h-4 w-4 mr-1" />
                  ) : (
                    <ChevronRight className="h-4 w-4 mr-1" />
                  )}
                  <span>{role}</span>
                  <Badge variant="secondary" className="ml-2 text-xs">
                    {filteredUsersByRole[role].length}
                  </Badge>
                </button>
                {(expandedRoles.has(role) || searchQuery) && (
                  <CommandGroup className="pl-4">
                    {filteredUsersByRole[role].map((user: any) => {
                      const isSelected = selectedRecipients.includes(user.email);
                      return (
                        <CommandItem
                          key={user.id}
                          value={user.email}
                          disabled={isSelected || selectedRecipients.length >= maxRecipients}
                          onSelect={() => handleSelectUser(user.email)}
                          className={cn(isSelected && "opacity-50")}
                        >
                          <Check
                            className={cn(
                              "mr-2 h-4 w-4",
                              isSelected ? "opacity-100" : "opacity-0"
                            )}
                          />
                          <div className="flex flex-col">
                            <span className="font-medium">{getUserDisplayName(user)}</span>
                            <span className="text-xs text-muted-foreground">{user.email}</span>
                          </div>
                        </CommandItem>
                      );
                    })}
                  </CommandGroup>
                )}
              </div>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
