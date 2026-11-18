import { useTranslation } from "react-i18next";
import { UseFormReturn } from "react-hook-form";
import { FormData } from "./types";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { LabelWithHelp } from "@/components/shared/contextual-help";
import { DangerIconButton } from "@/components/shared/danger-icon-button";
import { X, UserPen, ChevronDown, Handshake } from "lucide-react";

const STAKEHOLDER_TYPE_OPTIONS = ["Technical Champion", "Business Champion", "Economic Buyer", "Project Admin", "IT Admin", "IT Leader", "Non-IT", "C-Level", "Leadership"];

interface AccessSectionProps {
  form: UseFormReturn<FormData>;
  users: any[];
  roles: any[];
  customers: any[];
  selectedCustomerUsers: Array<{userId?: string, email: string, permission: string, firstName?: string, lastName?: string}>;
  setSelectedCustomerUsers: React.Dispatch<React.SetStateAction<Array<{userId?: string, email: string, permission: string, firstName?: string, lastName?: string}>>>;
  selectedAdditionalAccess: Array<{userId: string, permission: string}>;
  setSelectedAdditionalAccess: React.Dispatch<React.SetStateAction<Array<{userId: string, permission: string}>>>;
  setIsCreateUserDialogOpen: (open: boolean) => void;
  updateStakeholderTypesMutation: any;
  customerUsersForTcc: any[];
}

export function AccessSection({
  form,
  users,
  roles,
  customers,
  selectedCustomerUsers,
  setSelectedCustomerUsers,
  selectedAdditionalAccess,
  setSelectedAdditionalAccess,
  setIsCreateUserDialogOpen,
  updateStakeholderTypesMutation,
  customerUsersForTcc,
}: AccessSectionProps) {
  const { t } = useTranslation();
  const hasCustomerUser = selectedCustomerUsers.length > 0 || selectedAdditionalAccess.some(a => {
    const u = users?.find((u: any) => u.id === a.userId);
    return u?.role === 'Customer';
  });
  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Label className="text-sm font-medium dark:text-slate-200">{t('projects.form.access.customerUsers')}</Label>
          <div className="flex items-center gap-2">
            <Select onValueChange={(userId) => {
              const selectedUser = users?.find(u => u.id === userId);
              if (selectedUser) {
                if (!selectedCustomerUsers.some(user => user.userId === selectedUser.id)) {
                  setSelectedCustomerUsers(prev => [...prev, {
                    userId: selectedUser.id,
                    permission: "View",
                    firstName: selectedUser.firstName,
                    lastName: selectedUser.lastName,
                    email: selectedUser.email
                  }]);
                  if (!form.getValues("customerStakeholder")) {
                    form.setValue("customerStakeholder", selectedUser.email);
                  }
                }
              }
            }}>
              <SelectTrigger className="w-64 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200">
                <SelectValue placeholder={t('projects.form.access.addExistingUser')} />
              </SelectTrigger>
              <SelectContent>
                {(() => {
                  const selectedCustomerName = form.getValues("customerName");
                  const selectedCustomer = customers?.find((c: any) => c.accountName === selectedCustomerName);
                  const allowedUserIds = selectedCustomer?.contactUsers?.map((contact: any) => contact.userId) || [];

                  return users?.filter(user =>
                    (user.role === 'Customer' || user.role === 'Guest') &&
                    allowedUserIds.includes(user.id) &&
                    !selectedCustomerUsers.some(selected => selected.userId === user.id)
                  ).map((user) => (
                    <SelectItem key={user.id} value={user.id}>
                      <span className={user.isApproved === false ? 'text-red-600' : 'text-black'}>
                        {user.firstName || user.lastName ? `${user.firstName || ''} ${user.lastName || ''}`.trim() : user.email}
                      </span>
                    </SelectItem>
                  ));
                })()}
              </SelectContent>
            </Select>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 shrink-0"
                    onClick={() => setIsCreateUserDialogOpen(true)}
                  >
                    <UserPen className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{t('projects.form.access.createUser')}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>

        {selectedCustomerUsers.length > 0 && (
          <div className="space-y-2">
            <Label className="text-sm font-medium dark:text-slate-200">{t('projects.form.access.selectedCustomerUsers')}</Label>
            <div className="border rounded-md dark:border-slate-700">
              <Table>
                <TableHeader>
                  <TableRow className="bg-gray-100 dark:bg-slate-700">
                    <TableHead className="text-left dark:text-slate-300 w-[30%] px-2 py-1.5 text-xs">{t('projects.form.access.userHeader')}</TableHead>
                    <TableHead className="text-left dark:text-slate-300 w-[15%] px-2 py-1.5 text-xs">{t('common.role')}</TableHead>
                    <TableHead className="text-left dark:text-slate-300 w-[25%] px-2 py-1.5 text-xs">{t('projects.form.access.stakeholder')}</TableHead>
                    <TableHead className="text-left dark:text-slate-300 w-[15%] px-2 py-1.5 text-xs">{t('projects.form.access.accessRights')}</TableHead>
                    <TableHead className="text-right dark:text-slate-300 w-[15%] px-2 py-1.5 text-xs">{t('common.actions')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {selectedCustomerUsers.map((userInfo, index) => {
                    const fullUser = userInfo.userId
                      ? users?.find(u => u.id === userInfo.userId)
                      : users?.find(u => u.email === userInfo.email);
                    const displayName = fullUser ?
                      (fullUser.firstName || fullUser.lastName ?
                        `${fullUser.firstName || ''} ${fullUser.lastName || ''}`.trim() :
                        fullUser.email
                      ) :
                      (userInfo.firstName || userInfo.lastName ?
                        `${userInfo.firstName || ''} ${userInfo.lastName || ''}`.trim() :
                        userInfo.email
                      );
                    const currentStakeholderTypes = (fullUser?.stakeholderTypes || []).filter((st: string) => STAKEHOLDER_TYPE_OPTIONS.includes(st));

                    return (
                    <TableRow
                      key={`customer-user-${userInfo.userId}-${index}-${Date.now()}`}
                      className={`dark:border-slate-700 ${index % 2 === 0 ? 'bg-white dark:bg-slate-900' : 'bg-gray-50 dark:bg-slate-800'}`}
                    >
                      <TableCell className={`px-2 py-1.5 font-medium ${fullUser?.isApproved === false ? 'text-red-600' : 'text-black dark:text-slate-200'}`}>
                        {displayName}
                      </TableCell>
                      <TableCell className="px-2 py-1.5">
                        <Badge
                          style={{
                            backgroundColor: (() => {
                              const role = roles.find((r: any) => r.name === fullUser?.role);
                              return role?.color || "#6b7280";
                            })(),
                            color: 'white'
                          }}
                          className="text-xs px-2 py-1"
                        >
                          {fullUser?.role || t('projects.form.access.unknown')}
                        </Badge>
                      </TableCell>
                      <TableCell className="px-2 py-1.5">
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button variant="outline" size="sm" className="h-7 text-xs gap-1">
                              {currentStakeholderTypes.length ? (
                                <span className="truncate max-w-[120px]">{t('projects.form.access.nSelected', { count: currentStakeholderTypes.length })}</span>
                              ) : (
                                <span className="text-muted-foreground">{t('projects.form.access.selectStakeholder')}</span>
                              )}
                              <ChevronDown className="h-3 w-3 opacity-50" />
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-56 p-2" align="start">
                            <div className="space-y-1 max-h-48 overflow-y-auto">
                              {STAKEHOLDER_TYPE_OPTIONS.map(type => (
                                <div key={type} className="flex items-center space-x-2 py-1 px-1 hover:bg-gray-50 dark:hover:bg-gray-800 rounded">
                                  <Checkbox
                                    id={`sh-${userInfo.userId}-${type}`}
                                    checked={currentStakeholderTypes.includes(type)}
                                    onCheckedChange={(checked) => {
                                      const updated = checked
                                        ? [...currentStakeholderTypes, type]
                                        : currentStakeholderTypes.filter((st: string) => st !== type);
                                      if (fullUser?.id) {
                                        updateStakeholderTypesMutation.mutate({ userId: fullUser.id, stakeholderTypes: updated });
                                      }
                                    }}
                                    className="h-3.5 w-3.5"
                                  />
                                  <label htmlFor={`sh-${userInfo.userId}-${type}`} className="text-xs cursor-pointer">{type}</label>
                                </div>
                              ))}
                            </div>
                          </PopoverContent>
                        </Popover>
                      </TableCell>
                      <TableCell className="px-2 py-1.5">
                        <Select
                          value={userInfo.permission}
                          onValueChange={(value) => {
                            setSelectedCustomerUsers(prev =>
                              prev.map((user, i) =>
                                i === index ? { ...user, permission: value } : user
                              )
                            );
                          }}
                        >
                          <SelectTrigger className="w-24 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="View">{t('projects.form.access.permissionView')}</SelectItem>
                            <SelectItem value="Edit">{t('projects.form.access.permissionEdit')}</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="text-right px-2 py-1.5">
                        <DangerIconButton
                          onClick={() => {
                            setSelectedCustomerUsers(prev => prev.filter((_, i) => i !== index));
                            if (form.getValues("customerStakeholder") === userInfo.email) {
                              const remaining = selectedCustomerUsers.filter((_, i) => i !== index);
                              form.setValue("customerStakeholder", remaining[0]?.email || "");
                            }
                          }}
                        ></DangerIconButton>
                      </TableCell>
                    </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </div>
        )}

        <div className="space-y-4 border-t pt-6 dark:border-slate-700">
          <div className="flex items-center justify-between">
            <LabelWithHelp label={t('projects.form.access.additionalAccess')} helpKey="additionalAccess" />
            <div className="flex items-center gap-2">
              <Select onValueChange={(userId) => {
                const selectedUser = users?.find(u => u.id === userId);
                if (selectedUser) {
                  if (!selectedAdditionalAccess.some(access => access.userId === userId)) {
                    setSelectedAdditionalAccess(prev => [...prev, {
                      userId: userId,
                      permission: "View"
                    }]);
                  }
                }
              }}>
                <SelectTrigger className="w-64 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200">
                  <SelectValue placeholder={t('projects.form.access.addUserByRole')} />
                </SelectTrigger>
                <SelectContent>
                  {users?.filter(user =>
                    (user.role === 'Guest' || user.role === 'Partner') &&
                    !selectedAdditionalAccess.some(access => access.userId === user.id)
                  ).map((user) => (
                    <SelectItem key={user.id} value={user.id}>
                      <span className={user.isApproved === false ? 'text-red-600' : 'text-black'}>
                        {user.firstName || user.lastName ? `${user.firstName || ''} ${user.lastName || ''}`.trim() : user.email} ({user.role})
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {selectedAdditionalAccess.length > 0 && (
            <div className="space-y-2">
              <Label className="text-sm font-medium dark:text-slate-200">{t('projects.form.access.additionalAccessLabel')}</Label>
              <div className="border rounded-md dark:border-slate-700">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-gray-100 dark:bg-slate-700">
                      <TableHead className="text-left dark:text-slate-300 w-[30%] px-2 py-1.5 text-xs">{t('projects.form.access.userHeader')}</TableHead>
                      <TableHead className="text-left dark:text-slate-300 w-[15%] px-2 py-1.5 text-xs">{t('common.role')}</TableHead>
                      <TableHead className="text-left dark:text-slate-300 w-[25%] px-2 py-1.5 text-xs">{t('projects.form.access.stakeholder')}</TableHead>
                      <TableHead className="text-left dark:text-slate-300 w-[15%] px-2 py-1.5 text-xs">{t('projects.form.access.accessRights')}</TableHead>
                      <TableHead className="text-right dark:text-slate-300 w-[15%] px-2 py-1.5 text-xs">{t('common.actions')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedAdditionalAccess.map((accessInfo, index) => {
                      const fullUser = users?.find(u => u.id === accessInfo.userId);
                      const displayName = fullUser ?
                        (fullUser.firstName || fullUser.lastName ?
                          `${fullUser.firstName || ''} ${fullUser.lastName || ''}`.trim() :
                          fullUser.email
                        ) : t('projects.form.access.unknownUser');
                      const currentStakeholderTypes = (fullUser?.stakeholderTypes || []).filter((st: string) => STAKEHOLDER_TYPE_OPTIONS.includes(st));

                      return (
                      <TableRow
                        key={`additional-access-${accessInfo.userId}-${index}-${Date.now()}`}
                        className={`dark:border-slate-700 ${index % 2 === 0 ? 'bg-white dark:bg-slate-900' : 'bg-gray-50 dark:bg-slate-800'}`}
                      >
                        <TableCell className={`px-2 py-1.5 font-medium ${fullUser?.isApproved === false ? 'text-red-600' : 'text-black dark:text-slate-200'}`}>
                          {displayName}
                        </TableCell>
                        <TableCell className="px-2 py-1.5">
                          <Badge
                            style={{
                              backgroundColor: (() => {
                                const role = roles.find((r: any) => r.name === fullUser?.role);
                                return role?.color || "#6b7280";
                              })(),
                              color: 'white'
                            }}
                            className="text-xs px-2 py-1"
                          >
                            {fullUser?.role || t('projects.form.access.unknown')}
                          </Badge>
                        </TableCell>
                        <TableCell className="px-2 py-1.5">
                          <Popover>
                            <PopoverTrigger asChild>
                              <Button variant="outline" size="sm" className="h-7 text-xs gap-1">
                                {currentStakeholderTypes.length ? (
                                  <span className="truncate max-w-[120px]">{t('projects.form.access.nSelected', { count: currentStakeholderTypes.length })}</span>
                                ) : (
                                  <span className="text-muted-foreground">{t('projects.form.access.selectStakeholder')}</span>
                                )}
                                <ChevronDown className="h-3 w-3 opacity-50" />
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-56 p-2" align="start">
                              <div className="space-y-1 max-h-48 overflow-y-auto">
                                {STAKEHOLDER_TYPE_OPTIONS.map(type => (
                                  <div key={type} className="flex items-center space-x-2 py-1 px-1 hover:bg-gray-50 dark:hover:bg-gray-800 rounded">
                                    <Checkbox
                                      id={`sh-aa-${accessInfo.userId}-${type}`}
                                      checked={currentStakeholderTypes.includes(type)}
                                      onCheckedChange={(checked) => {
                                        const updated = checked
                                          ? [...currentStakeholderTypes, type]
                                          : currentStakeholderTypes.filter((st: string) => st !== type);
                                        if (fullUser?.id) {
                                          updateStakeholderTypesMutation.mutate({ userId: fullUser.id, stakeholderTypes: updated });
                                        }
                                      }}
                                      className="h-3.5 w-3.5"
                                    />
                                    <label htmlFor={`sh-aa-${accessInfo.userId}-${type}`} className="text-xs cursor-pointer">{type}</label>
                                  </div>
                                ))}
                              </div>
                            </PopoverContent>
                          </Popover>
                        </TableCell>
                        <TableCell className="px-2 py-1.5">
                          <Select
                            value={accessInfo.permission}
                            onValueChange={(value) => {
                              setSelectedAdditionalAccess(prev =>
                                prev.map((access, i) =>
                                  i === index ? { ...access, permission: value } : access
                                )
                              );
                            }}
                          >
                            <SelectTrigger className="w-24 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="View">{t('projects.form.access.permissionView')}</SelectItem>
                              <SelectItem value="Edit">{t('projects.form.access.permissionEdit')}</SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell className="text-right px-2 py-1.5">
                          <DangerIconButton
                            onClick={() => {
                              setSelectedAdditionalAccess(prev => prev.filter((_, i) => i !== index));
                            }}
                          ></DangerIconButton>
                        </TableCell>
                      </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </div>

        {/* TCC Section */}
        <div className="space-y-4 border-t pt-6 dark:border-slate-700">
          <div className="flex items-center justify-between">
            <FormLabel className="text-base font-semibold flex items-center gap-2 dark:text-slate-100">
              <Handshake className="h-5 w-5" />
              {t('projects.form.access.tccTitle')}
            </FormLabel>
            <div className="flex items-center gap-4">
              {hasCustomerUser && (
                <FormField
                  control={form.control}
                  name="tccUseProjectUser"
                  render={({ field }) => (
                    <FormItem className="flex items-center space-x-2">
                      <FormControl>
                        <Checkbox
                          checked={field.value}
                          onCheckedChange={(checked) => {
                            field.onChange(checked);
                            if (!checked) {
                              form.setValue("tccUserId", "");
                            } else {
                              form.setValue("tccFirstName", "");
                              form.setValue("tccLastName", "");
                            }
                          }}
                        />
                      </FormControl>
                      <FormLabel className="!mt-0 font-normal cursor-pointer dark:text-slate-300">
                        {t('projects.form.access.useProjectUser')}
                      </FormLabel>
                    </FormItem>
                  )}
                />
              )}
              <FormField
                control={form.control}
                name="tccCommitteeApproval"
                render={({ field }) => (
                  <FormItem className="flex items-center space-x-2">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                    <FormLabel className="!mt-0 font-normal cursor-pointer dark:text-slate-300">
                      {t('projects.form.access.committeeApproval')}
                    </FormLabel>
                  </FormItem>
                )}
              />
            </div>
          </div>

          {form.watch("tccUseProjectUser") && hasCustomerUser ? (
            <FormField
              control={form.control}
              name="tccUserId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="dark:text-slate-200">{t('projects.form.access.selectUser')}</FormLabel>
                  <Select
                    onValueChange={(value) => {
                      field.onChange(value);
                      const selectedUser = selectedCustomerUsers.find((u) => u.userId === value);
                      if (selectedUser) {
                        form.setValue("tccFirstName", selectedUser.firstName || "");
                        form.setValue("tccLastName", selectedUser.lastName || "");
                      }
                    }}
                    value={field.value}
                  >
                    <FormControl>
                      <SelectTrigger className="dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200">
                        <SelectValue placeholder={t('projects.form.access.selectCustomerUser')} />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {selectedCustomerUsers.filter((u) => !!u.userId).length > 0 ? (
                        selectedCustomerUsers
                          .filter((u) => !!u.userId)
                          .map((user) => (
                            <SelectItem key={user.userId} value={user.userId!}>
                              {[user.firstName, user.lastName].filter(Boolean).join(" ") || user.email} ({user.email})
                            </SelectItem>
                          ))
                      ) : (
                        <SelectItem value="no-users" disabled>
                          {t('projects.form.access.noCustomerUsersAssigned')}
                        </SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
          ) : (
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="tccFirstName"
                render={({ field }) => (
                  <FormItem className="space-y-2">
                    <FormLabel className="dark:text-slate-200 h-5 flex items-center">{t('projects.form.access.firstName')}</FormLabel>
                    <FormControl>
                      <Input placeholder={t('projects.form.access.enterFirstName')} {...field} className="dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="tccLastName"
                render={({ field }) => (
                  <FormItem className="space-y-2">
                    <FormLabel className="dark:text-slate-200 h-5 flex items-center">{t('projects.form.access.lastName')}</FormLabel>
                    <FormControl>
                      <Input placeholder={t('projects.form.access.enterLastName')} {...field} className="dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          )}
        </div>

      </div>

    </div>
  );
}
