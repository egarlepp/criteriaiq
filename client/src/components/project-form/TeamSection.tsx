import { UseFormReturn } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { FormData } from "./types";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { LabelWithHelp } from "@/components/shared/contextual-help";
import { X } from "lucide-react";
import { UseMutationResult } from "@tanstack/react-query";
import { ProjectTeamFields } from "./ProjectTeamFields";

interface TeamSectionProps {
  form: UseFormReturn<FormData>;
  users: any[];
  roles: any[];
  selectedSupportingEngineers: Array<{userId: string}>;
  setSelectedSupportingEngineers: React.Dispatch<React.SetStateAction<Array<{userId: string}>>>;
  selectedAdditionalSupportingTeam: Array<{userId: string}>;
  setSelectedAdditionalSupportingTeam: React.Dispatch<React.SetStateAction<Array<{userId: string}>>>;
}

export function TeamSection({
  form,
  users,
  roles,
  selectedSupportingEngineers,
  setSelectedSupportingEngineers,
  selectedAdditionalSupportingTeam,
  setSelectedAdditionalSupportingTeam,
}: TeamSectionProps) {
  const { t } = useTranslation();
  return (
    <div className="space-y-6">
      <ProjectTeamFields form={form} />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <FormField
          control={form.control}
          name="opportunityEngineer"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="dark:text-slate-200">{t('projects.form.team.opportunityEngineer')} <span className="text-red-500">*</span></FormLabel>
              <Select onValueChange={field.onChange} value={field.value}>
                <FormControl>
                  <SelectTrigger className="dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200">
                    <SelectValue placeholder={t('projects.form.team.selectOpportunityEngineer')} />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {users?.filter(user => user.isActive === true && user.role === 'Engineer').map((user) => (
                    <SelectItem key={user.id} value={user.id}>
                      <span className={user.isApproved === false ? 'text-red-600' : 'text-black'}>
                        {user.firstName || user.lastName ? `${user.firstName || ''} ${user.lastName || ''}`.trim() : user.email}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="accountRepresentative"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="dark:text-slate-200">{t('projects.form.team.opportunityRepresentative')} <span className="text-red-500">*</span></FormLabel>
              <Select onValueChange={field.onChange} value={field.value}>
                <FormControl>
                  <SelectTrigger className="dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200">
                    <SelectValue placeholder={t('projects.form.team.selectOpportunityRepresentative')} />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {users?.filter(user => user.isActive === true && user.role === 'Sales').map((user) => (
                    <SelectItem key={user.id} value={user.id}>
                      <span className={user.isApproved === false ? 'text-red-600' : 'text-black'}>
                        {user.firstName || user.lastName ? `${user.firstName || ''} ${user.lastName || ''}`.trim() : user.email}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <FormField
          control={form.control}
          name="primarySe"
          render={({ field }) => {
            return (
            <FormItem>
              <LabelWithHelp label="Project: Primary Engineer" helpKey="primaryEngineer" required />
              <Select onValueChange={(value) => {
                field.onChange(value);
              }} value={field.value}>
                <FormControl>
                  <SelectTrigger className="dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200">
                    <SelectValue placeholder={t('projects.form.team.selectPrimaryEngineer')} />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {users?.filter(user => 
                    user.isActive === true && 
                    user.role === 'Engineer' &&
                    String(user.id) !== form.watch("specialistSe")
                  ).map((user) => (
                    <SelectItem key={user.id} value={user.id}>
                      <span className={user.isApproved === false ? 'text-red-600' : 'text-black'}>
                        {user.firstName || user.lastName ? `${user.firstName || ''} ${user.lastName || ''}`.trim() : user.email}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
            );
          }}
        />
        <FormField
          control={form.control}
          name="specialistSe"
          render={({ field }) => {
            return (
            <FormItem>
              <LabelWithHelp label="Project: Specialist Engineer" helpKey="specialistEngineer" />
              <Select onValueChange={(value) => {
                field.onChange(value);
              }} value={field.value}>
                <FormControl>
                  <SelectTrigger className="dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200">
                    <SelectValue placeholder={t('projects.form.team.selectSpecialistEngineer')} />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {users?.filter(user => 
                    user.isActive === true && 
                    user.role === 'Engineer' &&
                    String(user.id) !== form.watch("primarySe")
                  ).map((user) => (
                    <SelectItem key={user.id} value={user.id}>
                      <span className={user.isApproved === false ? 'text-red-600' : 'text-black'}>
                        {user.firstName || user.lastName ? `${user.firstName || ''} ${user.lastName || ''}`.trim() : user.email}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
            );
          }}
        />
      </div>

      <FormField
        control={form.control}
        name="supportingSalesEngineers"
        render={({ field }) => (
          <FormItem>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <LabelWithHelp label="Project: Supporting Engineers" helpKey="supportingEngineers" />
                <div className="flex items-center gap-2">
                  <Select onValueChange={(userId) => {
                    const selectedUser = users?.find((u: any) => String(u.id) === userId || u.id === userId);
                    if (selectedUser) {
                      if (!selectedSupportingEngineers.some(se => se.userId === userId)) {
                        const newEngineers = [...selectedSupportingEngineers, { userId }];
                        setSelectedSupportingEngineers(newEngineers);
                        field.onChange(newEngineers.map(se => se.userId));
                      }
                    }
                  }}>
                    <SelectTrigger className="w-48 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200">
                      <SelectValue placeholder={t('projects.form.team.addEngineer')} />
                    </SelectTrigger>
                    <SelectContent>
                      {users?.filter((user: any) => 
                        user.isActive === true && 
                        user.role === 'Engineer' &&
                        String(user.id) !== form.watch("primarySe") &&
                        String(user.id) !== form.watch("specialistSe") &&
                        !selectedSupportingEngineers.some(se => se.userId === String(user.id))
                      ).map((user: any) => (
                        <SelectItem key={user.id} value={String(user.id)}>
                          <span className={user.isApproved === false ? 'text-red-600' : 'text-black'}>
                            {user.firstName || user.lastName ? `${user.firstName || ''} ${user.lastName || ''}`.trim() : user.email}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {selectedSupportingEngineers.length > 0 && (
                <div className="space-y-2">
                  <Label className="text-sm font-medium dark:text-slate-200">{t('projects.form.team.selectedSupportingEngineers')}:</Label>
                  <div className="border rounded-md dark:border-slate-700">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-gray-50 dark:bg-slate-800">
                          <TableHead className="text-left dark:text-slate-300">{t('projects.form.team.engineer')}</TableHead>
                          <TableHead className="text-right dark:text-slate-300">{t('common.actions')}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {selectedSupportingEngineers.map((engineerInfo, index) => {
                          const fullUser = users?.find((u: any) => String(u.id) === engineerInfo.userId || u.id === engineerInfo.userId);
                          const displayName = fullUser ? 
                            (fullUser.firstName || fullUser.lastName ? 
                              `${fullUser.firstName || ''} ${fullUser.lastName || ''}`.trim() : 
                              fullUser.email
                            ) : 'Unknown User';

                          return (
                            <TableRow key={`supporting-engineer-${engineerInfo.userId}-${index}`} className="dark:border-slate-700">
                              <TableCell className={`font-medium ${fullUser?.isApproved === false ? 'text-red-600' : 'text-black dark:text-slate-200'}`}>
                                {displayName}
                              </TableCell>
                              <TableCell className="text-right">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => {
                                    const newEngineers = selectedSupportingEngineers.filter((_, i) => i !== index);
                                    setSelectedSupportingEngineers(newEngineers);
                                    field.onChange(newEngineers.map(se => se.userId));
                                  }}
                                  className="dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-slate-700"
                                >
                                  <X className="h-4 w-4" />
                                </Button>
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
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name="additionalSupportingTeam"
        render={({ field }) => (
          <FormItem>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <LabelWithHelp label="Project: Additional Supporting Team" helpKey="additionalSupportingTeam" />
                <div className="flex items-center gap-2">
                  <Select onValueChange={(userId) => {
                    const selectedUser = users?.find((u: any) => String(u.id) === userId || u.id === userId);
                    if (selectedUser) {
                      if (!selectedAdditionalSupportingTeam.some(member => member.userId === userId)) {
                        const newTeam = [...selectedAdditionalSupportingTeam, { userId }];
                        setSelectedAdditionalSupportingTeam(newTeam);
                        field.onChange(newTeam.map(member => member.userId));
                      }
                    }
                  }}>
                    <SelectTrigger className="w-48 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200">
                      <SelectValue placeholder={t('projects.form.team.addTeamMember')} />
                    </SelectTrigger>
                    <SelectContent>
                      {users?.filter((user: any) => 
                        user.isActive === true && 
                        (user.role === 'CX' || user.role === 'ProServ' || user.role === 'Product' || user.role === 'Support' || user.role === 'Admin') &&
                        !selectedAdditionalSupportingTeam.some(member => member.userId === String(user.id))
                      ).map((user: any) => (
                        <SelectItem key={user.id} value={String(user.id)}>
                          <span className={user.isApproved === false ? 'text-red-600' : 'text-black'}>
                            {user.firstName || user.lastName ? `${user.firstName || ''} ${user.lastName || ''}`.trim() : user.email} ({user.role})
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {selectedAdditionalSupportingTeam.length > 0 && (
                <div className="space-y-2">
                  <Label className="text-sm font-medium dark:text-slate-200">{t('projects.form.team.selectedAdditionalTeam')}:</Label>
                  <div className="border rounded-md dark:border-slate-700">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-gray-50 dark:bg-slate-800">
                          <TableHead className="text-left dark:text-slate-300">{t('projects.form.team.teamMember')}</TableHead>
                          <TableHead className="text-left dark:text-slate-300">{t('projects.form.team.role')}</TableHead>
                          <TableHead className="text-right dark:text-slate-300">{t('common.actions')}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {selectedAdditionalSupportingTeam.map((memberInfo, index) => {
                          const fullUser = users?.find((u: any) => String(u.id) === memberInfo.userId || u.id === memberInfo.userId);
                          const displayName = fullUser ? 
                            (fullUser.firstName || fullUser.lastName ? 
                              `${fullUser.firstName || ''} ${fullUser.lastName || ''}`.trim() : 
                              fullUser.email
                            ) : 'Unknown User';

                          return (
                            <TableRow key={`additional-team-${memberInfo.userId}-${index}`} className="dark:border-slate-700">
                              <TableCell className={`font-medium ${fullUser?.isApproved === false ? 'text-red-600' : 'text-black dark:text-slate-200'}`}>
                                {displayName}
                              </TableCell>
                              <TableCell>
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
                                  {fullUser?.role || 'Unknown'}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-right">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => {
                                    const newTeam = selectedAdditionalSupportingTeam.filter((_, i) => i !== index);
                                    setSelectedAdditionalSupportingTeam(newTeam);
                                    field.onChange(newTeam.map(member => member.userId));
                                  }}
                                  className="dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-slate-700"
                                >
                                  <X className="h-4 w-4" />
                                </Button>
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
            <FormMessage />
          </FormItem>
        )}
      />
    </div>
  );
}
