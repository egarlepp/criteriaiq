import { useState, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useForm, Controller } from "react-hook-form";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { showErrorToast, showSuccessToast } from "@/lib/toast-helper";
import { invalidateInfrastructureProfiles } from "./infrastructure-profile-summary";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { DangerIconButton } from "@/components/shared/danger-icon-button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Plus,
  Save,
  Star,
  User,
  Calendar,
  SquarePen,
  Trash2,
  BriefcaseBusiness,
  Shield,
  Server,
  Network,
  Database,
  Cloud,
  Settings,
  Lock,
  Monitor,
  Building2,
  X,
  Link2,
  Unlink,
  CircleCheck,
} from "lucide-react";

interface InfrastructureProfile {
  id: number;
  customerId: number;
  profileName: string;
  isDefault: boolean;
  discoveryData: any;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  creatorName?: string;
}

export interface AttachableInfrastructureProfile {
  id: number;
  profileName: string;
}

interface InfrastructureDiscoveryDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customerId: number;
  customerName: string;
  /** Profile to show first when the drawer opens (else the attached one, else the default). */
  initialProfileId?: number | null;
  /** The profile attached to the project this drawer was opened from. */
  attachedProfileId?: number | null;
  /**
   * Given only by the project form: shows "Attach to project" for the
   * selected profile and "Detach" for the attached one (null detaches).
   */
  onAttachProfile?: (profile: AttachableInfrastructureProfile | null) => void;
}

const CATEGORY_ICONS: Record<string, any> = {
  identity_directory: Shield,
  endpoint_server_platforms: Monitor,
  network_connectivity: Network,
  storage_file_systems: Database,
  application_landscape: Building2,
  security_architecture: Lock,
  operations_service_management: Settings,
  cloud_saas_posture: Cloud,
};

const CATEGORY_LABELS: Record<string, string> = {
  identity_directory: "Identity & Directory Services",
  endpoint_server_platforms: "Endpoint & Server Platforms",
  network_connectivity: "Network & Connectivity",
  storage_file_systems: "Storage & File Systems",
  application_landscape: "Application Landscape",
  security_architecture: "Security Architecture",
  operations_service_management: "Operations & Service Management",
  cloud_saas_posture: "Cloud & SaaS Posture",
};

interface ArrayInputFieldProps {
  label: string;
  placeholder?: string;
  currentValues: string[];
  onAdd: (value: string) => void;
  onRemove: (index: number) => void;
}

function ArrayInputField({
  label,
  placeholder,
  currentValues,
  onAdd,
  onRemove,
}: ArrayInputFieldProps) {
  const { t } = useTranslation();
  const effectivePlaceholder = placeholder ?? t("accounts.infraDiscovery.addItemPlaceholder");
  const [inputValue, setInputValue] = useState("");

  const handleAdd = () => {
    if (inputValue.trim()) {
      onAdd(inputValue.trim());
      setInputValue("");
    }
  };

  return (
    <div className="space-y-2">
      <Label className="text-sm font-medium">{label}</Label>
      <div className="flex gap-2">
        <Input
          placeholder={effectivePlaceholder}
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleAdd())}
        />
        <Button type="button" size="sm" onClick={handleAdd}>
          <Plus className="h-4 w-4" />
        </Button>
      </div>
      {currentValues.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-2">
          {currentValues.map((item: string, index: number) => (
            <Badge key={index} variant="secondary" className="gap-1">
              {item}
              <X
                className="h-3 w-3 cursor-pointer"
                onClick={() => onRemove(index)}
              />
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

const accentColorMap: Record<string, string> = {
  blue: '#3b82f6',
  purple: '#a855f7',
  green: '#22c55e',
  amber: '#f59e0b',
  red: '#ef4444',
  cyan: '#06b6d4',
  gray: '#6b7280',
  sky: '#0ea5e9',
};

interface StyledAccordionItemProps {
  value: string;
  color: keyof typeof accentColorMap;
  bgClass: string;
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}

function StyledAccordionItem({ value, color, bgClass, icon, title, children }: StyledAccordionItemProps) {
  const accentColor = accentColorMap[color];

  return (
    <AccordionItem
      value={value}
      className={`group border rounded-lg px-4 ${bgClass} relative`}
    >
      <div
        className="absolute left-0 top-0 bottom-0 w-1 rounded-l-lg overflow-hidden transition-all duration-200 opacity-0 group-hover:opacity-100 group-data-[state=open]:opacity-100"
        style={{ backgroundColor: accentColor }}
      />
      <AccordionTrigger className="hover:no-underline">
        <div className="flex items-center gap-2">
          {icon}
          <span>{title}</span>
        </div>
      </AccordionTrigger>
      <AccordionContent className="space-y-4 pt-4 pb-1">
        {children}
      </AccordionContent>
    </AccordionItem>
  );
}

export default function InfrastructureDiscoveryDrawer({
  open,
  onOpenChange,
  customerId,
  customerName,
  initialProfileId,
  attachedProfileId,
  onAttachProfile,
}: InfrastructureDiscoveryDrawerProps) {
  const { t } = useTranslation();

  const UNKNOWN_PLACEHOLDER = t("accounts.infraDiscovery.unknownPlaceholder");

  const queryClient = useQueryClient();
  
  const [selectedProfileId, setSelectedProfileId] = useState<number | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [newProfileName, setNewProfileName] = useState("");
  const [editingProfileName, setEditingProfileName] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  const { control, reset, handleSubmit, watch, setValue, getValues } = useForm({
    defaultValues: {
      discoveryData: {} as any,
    },
  });

  const { data: profiles = [], isLoading } = useQuery<InfrastructureProfile[]>({
    queryKey: [`/api/customers/${customerId}/infrastructure-profiles`],
    enabled: open && !!customerId,
  });

  const selectedProfile = useMemo(() => {
    return profiles.find((p) => p.id === selectedProfileId);
  }, [profiles, selectedProfileId]);

  useEffect(() => {
    if (profiles.length > 0 && !selectedProfileId) {
      const preferred = [initialProfileId, attachedProfileId].find(
        (id) => id != null && profiles.some((p) => p.id === id),
      );
      const defaultProfile = profiles.find((p) => p.isDefault);
      setSelectedProfileId(preferred ?? defaultProfile?.id ?? profiles[0].id);
    }
  }, [profiles, selectedProfileId, initialProfileId, attachedProfileId]);

  useEffect(() => {
    if (selectedProfile) {
      reset({ discoveryData: selectedProfile.discoveryData || {} });
      setIsCreating(false);
    }
  }, [selectedProfile, reset]);

  useEffect(() => {
    if (!open) {
      setSelectedProfileId(null);
      setIsCreating(false);
      setNewProfileName("");
      setEditingProfileName(false);
    }
  }, [open]);

  const createProfileMutation = useMutation({
    mutationFn: async (data: { profileName: string; isDefault?: boolean }) => {
      return apiRequest("POST", `/api/customers/${customerId}/infrastructure-profiles`, data);
    },
    onSuccess: (newProfile: InfrastructureProfile) => {
      invalidateInfrastructureProfiles(queryClient, customerId);
      setSelectedProfileId(newProfile.id);
      setIsCreating(false);
      setNewProfileName("");
      showSuccessToast(t("accounts.infraDiscovery.toasts.createSuccess"));
    },
    onError: () => {
      showErrorToast(t("accounts.infraDiscovery.toasts.createError"));
    },
  });

  const updateProfileMutation = useMutation({
    mutationFn: async (data: { profileName?: string; discoveryData?: any }) => {
      return apiRequest("PATCH", `/api/infrastructure-profiles/${selectedProfileId}`, data);
    },
    onSuccess: () => {
      invalidateInfrastructureProfiles(queryClient, customerId);
      showSuccessToast(t("accounts.infraDiscovery.toasts.updateSuccess"));
    },
    onError: () => {
      showErrorToast(t("accounts.infraDiscovery.toasts.updateError"));
    },
  });

  const setDefaultMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("PUT", `/api/infrastructure-profiles/${selectedProfileId}/default`);
    },
    onSuccess: () => {
      invalidateInfrastructureProfiles(queryClient, customerId);
      showSuccessToast(t("accounts.infraDiscovery.toasts.defaultUpdated"));
    },
    onError: () => {
      showErrorToast(t("accounts.infraDiscovery.toasts.defaultError"));
    },
  });

  const deleteProfileMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("DELETE", `/api/infrastructure-profiles/${selectedProfileId}`);
    },
    onSuccess: () => {
      invalidateInfrastructureProfiles(queryClient, customerId);
      // Deleting the attached profile detaches it from the project too.
      if (onAttachProfile && selectedProfileId !== null && selectedProfileId === attachedProfileId) {
        onAttachProfile(null);
      }
      setSelectedProfileId(null);
      setDeleteConfirmOpen(false);
      showSuccessToast(t("accounts.infraDiscovery.toasts.deleteSuccess"));
    },
    onError: () => {
      showErrorToast(t("accounts.infraDiscovery.toasts.deleteError"));
    },
  });

  const onSave = handleSubmit((data) => {
    updateProfileMutation.mutate({ discoveryData: data.discoveryData });
  });

  const handleCreateProfile = () => {
    if (newProfileName.trim()) {
      createProfileMutation.mutate({ profileName: newProfileName.trim() });
    }
  };

  const handleRenameProfile = () => {
    if (newProfileName.trim() && selectedProfileId) {
      updateProfileMutation.mutate({ profileName: newProfileName.trim() });
      setEditingProfileName(false);
      setNewProfileName("");
    }
  };

  const renderEnumSelect = (
    path: string,
    label: string,
    options: { value: string; label: string }[]
  ) => (
    <div className="space-y-2">
      <Label className="text-sm font-medium">{label}</Label>
      <Controller
        name={`discoveryData.${path}` as any}
        control={control}
        render={({ field }) => (
          <Select
            value={field.value || ""}
            onValueChange={field.onChange}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder={UNKNOWN_PLACEHOLDER} />
            </SelectTrigger>
            <SelectContent>
              {options.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      />
    </div>
  );

  const renderNumberInput = (path: string, label: string, min = 0) => (
    <div className="space-y-2">
      <Label className="text-sm font-medium">{label}</Label>
      <Controller
        name={`discoveryData.${path}` as any}
        control={control}
        render={({ field }) => (
          <Input
            type="number"
            min={min}
            placeholder={UNKNOWN_PLACEHOLDER}
            value={field.value ?? ""}
            onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value) : undefined)}
          />
        )}
      />
    </div>
  );

  const renderTextInput = (path: string, label: string) => (
    <div className="space-y-2">
      <Label className="text-sm font-medium">{label}</Label>
      <Controller
        name={`discoveryData.${path}` as any}
        control={control}
        render={({ field }) => (
          <Input
            placeholder={UNKNOWN_PLACEHOLDER}
            value={field.value || ""}
            onChange={field.onChange}
          />
        )}
      />
    </div>
  );

  const renderTextarea = (path: string, label: string) => (
    <div className="space-y-2">
      <Label className="text-sm font-medium">{label}</Label>
      <Controller
        name={`discoveryData.${path}` as any}
        control={control}
        render={({ field }) => (
          <Textarea
            placeholder={UNKNOWN_PLACEHOLDER}
            value={field.value || ""}
            onChange={field.onChange}
            rows={3}
          />
        )}
      />
    </div>
  );

  const renderBooleanSwitch = (path: string, label: string) => (
    <div className="flex items-center justify-between">
      <Label className="text-sm font-medium">{label}</Label>
      <Controller
        name={`discoveryData.${path}` as any}
        control={control}
        render={({ field }) => (
          <Switch
            checked={field.value ?? false}
            onCheckedChange={field.onChange}
          />
        )}
      />
    </div>
  );

  const renderMultiSelect = (
    path: string,
    label: string,
    options: { value: string; label: string }[]
  ) => {
    const currentValues = watch(`discoveryData.${path}` as any) || [];
    
    return (
      <div className="space-y-2">
        <Label className="text-sm font-medium">{label}</Label>
        <div className="flex flex-wrap gap-2 p-2 border rounded-md min-h-[40px]">
          {options.map((opt) => {
            const isSelected = currentValues.includes(opt.value);
            return (
              <Badge
                key={opt.value}
                variant={isSelected ? "default" : "outline"}
                className="cursor-pointer"
                onClick={() => {
                  const newValues = isSelected
                    ? currentValues.filter((v: string) => v !== opt.value)
                    : [...currentValues, opt.value];
                  setValue(`discoveryData.${path}` as any, newValues);
                }}
              >
                {opt.label}
              </Badge>
            );
          })}
        </div>
      </div>
    );
  };

  const renderArrayInput = (path: string, label: string, placeholder = t("accounts.infraDiscovery.addItemPlaceholder")) => {
    const currentValues = watch(`discoveryData.${path}` as any) || [];

    const handleAdd = (value: string) => {
      setValue(`discoveryData.${path}` as any, [...currentValues, value]);
    };

    const handleRemove = (index: number) => {
      setValue(
        `discoveryData.${path}` as any,
        currentValues.filter((_: any, i: number) => i !== index)
      );
    };

    return (
      <ArrayInputField
        label={label}
        placeholder={placeholder}
        currentValues={currentValues}
        onAdd={handleAdd}
        onRemove={handleRemove}
      />
    );
  };

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="w-full sm:max-w-2xl p-0 flex flex-col" hideCloseButton>
          <SheetHeader className="p-4 border-b">
            <div className="flex items-start justify-between">
              <div>
                <SheetTitle className="flex items-center gap-2">
                  <BriefcaseBusiness className="h-5 w-5" />
                  {t("accounts.infraDiscovery.title")}
                </SheetTitle>
                <SheetDescription>
                  {t("accounts.infraDiscovery.drawerDescription", { customerName })}
                </SheetDescription>
              </div>
              {!isCreating && profiles.length > 0 && (
                <Button size="sm" onClick={() => setIsCreating(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  {t("accounts.infraDiscovery.createNewProfile")}
                </Button>
              )}
            </div>
          </SheetHeader>

          <div className="px-4 border-b bg-muted/30">
            {isCreating ? (
              <div className="space-y-3">
                <Label>{t("accounts.infraDiscovery.newProfileName")}</Label>
                <div className="flex gap-2">
                  <Input
                    placeholder={t("accounts.infraDiscovery.newProfileNamePlaceholder")}
                    value={newProfileName}
                    onChange={(e) => setNewProfileName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleCreateProfile()}
                    autoFocus
                  />
                  <Button onClick={handleCreateProfile} disabled={!newProfileName.trim()}>
                    {t("accounts.infraDiscovery.create")}
                  </Button>
                  <Button variant="outline" onClick={() => { setIsCreating(false); setNewProfileName(""); }}>
                    {t("common.cancel")}
                  </Button>
                </div>
              </div>
            ) : profiles.length === 0 ? (
              <div className="text-center py-2">
                <p className="text-muted-foreground mb-3">{t("accounts.infraDiscovery.noProfilesYet")}</p>
                <Button onClick={() => setIsCreating(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  {t("accounts.infraDiscovery.createFirstProfile")}
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="border rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="py-2">{t("accounts.infraDiscovery.tableHeaderProfileName")}</TableHead>
                        <TableHead className="py-2">{t("accounts.infraDiscovery.tableHeaderCreatedBy")}</TableHead>
                        <TableHead className="py-2">{t("accounts.infraDiscovery.tableHeaderLastUpdate")}</TableHead>
                        <TableHead className="py-2 text-center">{t("accounts.infraDiscovery.tableHeaderDefault")}</TableHead>
                        <TableHead className="py-2 text-right">{t("accounts.infraDiscovery.tableHeaderActions")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {profiles.map((profile: InfrastructureProfile) => (
                        <TableRow 
                          key={profile.id}
                          className={selectedProfileId === profile.id ? "bg-muted/50" : ""}
                        >
                          <TableCell className="py-2 font-medium">
                            <span className="inline-flex flex-wrap items-center gap-1.5">
                              {profile.profileName}
                              {onAttachProfile && attachedProfileId === profile.id && (
                                <Badge className="text-[10px] px-1.5 py-0 bg-emerald-100 text-emerald-800 hover:bg-emerald-100 dark:bg-emerald-900/40 dark:text-emerald-300 dark:hover:bg-emerald-900/40">
                                  {t("accounts.infraDiscovery.attach.badge")}
                                </Badge>
                              )}
                            </span>
                          </TableCell>
                          <TableCell className="py-2">{profile.creatorName || t("accounts.infraDiscovery.unknownUser")}</TableCell>
                          <TableCell className="py-2">{new Date(profile.updatedAt).toLocaleDateString()}</TableCell>
                          <TableCell className="py-2 text-center">
                            {profile.isDefault ? (
                              <Badge variant="secondary" className="text-xs">
                                <Star className="h-3 w-3 mr-1 fill-current" />
                                {t("accounts.infraDiscovery.default")}
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                          <TableCell className="py-2 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 px-2"
                                    onClick={() => setSelectedProfileId(profile.id)}
                                  >
                                    <SquarePen className="h-3 w-3" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>{t("accounts.infraDiscovery.editProfile")}</TooltipContent>
                              </Tooltip>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <DangerIconButton
                                    className="h-7 w-7"
                                    onClick={() => {
                                      setSelectedProfileId(profile.id);
                                      setDeleteConfirmOpen(true);
                                    }}
                                  >
                                    <Trash2 className="h-3 w-3" />
                                  </DangerIconButton>
                                </TooltipTrigger>
                                <TooltipContent>{t("accounts.infraDiscovery.deleteProfile")}</TooltipContent>
                              </Tooltip>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                <Separator />

                <div className="space-y-2">
                  <div className="flex-1">
                    <Label className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                      <BriefcaseBusiness className="h-3 w-3" />
                      {t("accounts.infraDiscovery.activeProfile")}
                    </Label>
                    <Select
                      value={selectedProfileId?.toString() || ""}
                      onValueChange={(val) => setSelectedProfileId(parseInt(val))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={t("accounts.infraDiscovery.selectProfile")} />
                      </SelectTrigger>
                      <SelectContent>
                        {profiles.map((profile: InfrastructureProfile) => (
                          <SelectItem key={profile.id} value={profile.id.toString()}>
                            <div className="flex items-center gap-2">
                              {profile.profileName}
                              {profile.isDefault && (
                                <Badge variant="secondary" className="text-xs">{t("accounts.infraDiscovery.default")}</Badge>
                              )}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {onAttachProfile && selectedProfile && (
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 dark:border-blue-800 dark:bg-blue-950/40">
                    {attachedProfileId === selectedProfile.id ? (
                      <>
                        <span className="flex items-center gap-1.5 text-sm font-medium text-emerald-700 dark:text-emerald-300">
                          <CircleCheck className="h-4 w-4" />
                          {t("accounts.infraDiscovery.attach.attached")}
                        </span>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-7"
                          onClick={() => onAttachProfile(null)}
                        >
                          <Unlink className="h-3.5 w-3.5 mr-1.5" />
                          {t("accounts.infraDiscovery.attach.detach")}
                        </Button>
                      </>
                    ) : (
                      <>
                        <span className="text-sm text-blue-800 dark:text-blue-200">
                          {t("accounts.infraDiscovery.attach.hint")}
                        </span>
                        <Button
                          type="button"
                          size="sm"
                          className="h-7"
                          onClick={() =>
                            onAttachProfile({ id: selectedProfile.id, profileName: selectedProfile.profileName })
                          }
                        >
                          <Link2 className="h-3.5 w-3.5 mr-1.5" />
                          {t("accounts.infraDiscovery.attach.attach")}
                        </Button>
                      </>
                    )}
                  </div>
                )}

                {selectedProfile && (
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <div className="flex items-center gap-4">
                      <span className="flex items-center gap-1">
                        <User className="h-3 w-3" />
                        {t("accounts.infraDiscovery.createdBy", { name: selectedProfile.creatorName })}
                      </span>
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {new Date(selectedProfile.createdAt).toLocaleDateString()}
                      </span>
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {t("accounts.infraDiscovery.updatedDate", { date: new Date(selectedProfile.updatedAt).toLocaleDateString() })}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      {editingProfileName ? (
                        <div className="flex items-center gap-1">
                          <Input
                            className="h-7 w-32 text-xs"
                            value={newProfileName}
                            onChange={(e) => setNewProfileName(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && handleRenameProfile()}
                          />
                          <Button size="sm" variant="ghost" className="h-7 px-2" onClick={handleRenameProfile}>
                            {t("common.save")}
                          </Button>
                          <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => { setEditingProfileName(false); setNewProfileName(""); }}>
                            {t("common.cancel")}
                          </Button>
                        </div>
                      ) : (
                        <>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 px-2"
                                onClick={() => {
                                  setEditingProfileName(true);
                                  setNewProfileName(selectedProfile.profileName);
                                }}
                              >
                                <SquarePen className="h-3 w-3" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>{t("accounts.infraDiscovery.renameProfile")}</TooltipContent>
                          </Tooltip>
                          {!selectedProfile.isDefault && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 px-2"
                                  onClick={() => setDefaultMutation.mutate()}
                                >
                                  <Star className="h-3 w-3" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>{t("accounts.infraDiscovery.setAsDefault")}</TooltipContent>
                            </Tooltip>
                          )}
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <DangerIconButton
                                className="h-7 w-7"
                                onClick={() => setDeleteConfirmOpen(true)}
                              >
                                <Trash2 className="h-3 w-3" />
                              </DangerIconButton>
                            </TooltipTrigger>
                            <TooltipContent>{t("accounts.infraDiscovery.deleteProfile")}</TooltipContent>
                          </Tooltip>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {selectedProfile && (
            <>
              <ScrollArea className="flex-1 py-0 px-6">
                <form onSubmit={onSave} className="py-4">
                  <Accordion type="multiple" className="w-full space-y-2">
                    <StyledAccordionItem
                      value="identity_directory"
                      color="blue"
                      bgClass="bg-blue-50 dark:bg-blue-900/20"
                      icon={<Shield className="h-4 w-4 text-blue-600 dark:text-blue-400" />}
                      title={t("accounts.infraDiscovery.categories.identity_directory")}
                    >
                      {renderNumberInput("identity_directory.ad_users", t("accounts.infraDiscovery.fields.adUsers"))}
                      {renderEnumSelect("identity_directory.idp_primary", t("accounts.infraDiscovery.fields.idpPrimary"), [
                        { value: "entra_id", label: "Entra ID (Azure AD)" },
                        { value: "okta", label: "Okta" },
                        { value: "ping", label: "Ping Identity" },
                        { value: "adfs", label: "ADFS" },
                        { value: "other", label: t("accounts.infraDiscovery.options.other") },
                      ])}
                      {renderArrayInput("identity_directory.idp_secondary", t("accounts.infraDiscovery.fields.idpSecondary"))}
                      {renderMultiSelect("identity_directory.directory_types", t("accounts.infraDiscovery.fields.directoryTypes"), [
                        { value: "ad_ds", label: "AD DS" },
                        { value: "entra_id", label: "Entra ID" },
                        { value: "ldap", label: "LDAP" },
                        { value: "google_workspace", label: "Google Workspace" },
                        { value: "other", label: t("accounts.infraDiscovery.options.other") },
                      ])}
                      {renderNumberInput("identity_directory.ad_forest_count", t("accounts.infraDiscovery.fields.adForestCount"))}
                      {renderTextarea("identity_directory.privileged_access_model", t("accounts.infraDiscovery.fields.privilegedAccessModel"))}
                      {renderArrayInput("identity_directory.pam_tooling", t("accounts.infraDiscovery.fields.pamTooling"), t("accounts.infraDiscovery.fields.pamToolingPlaceholder"))}
                      {renderEnumSelect("identity_directory.identity_source_of_truth", t("accounts.infraDiscovery.fields.identitySourceOfTruth"), [
                        { value: "hris", label: "HRIS" },
                        { value: "iam", label: "IAM" },
                        { value: "itsm", label: "ITSM" },
                        { value: "ad", label: "Active Directory" },
                        { value: "other", label: t("accounts.infraDiscovery.options.other") },
                      ])}
                      {renderMultiSelect("identity_directory.mfa_methods", t("accounts.infraDiscovery.fields.mfaMethods"), [
                        { value: "push", label: t("accounts.infraDiscovery.options.pushNotification") },
                        { value: "totp", label: "TOTP" },
                        { value: "fido2", label: "FIDO2" },
                        { value: "sms", label: "SMS" },
                        { value: "cert", label: t("accounts.infraDiscovery.options.certificate") },
                        { value: "other", label: t("accounts.infraDiscovery.options.other") },
                      ])}
                    </StyledAccordionItem>

                    <StyledAccordionItem
                      value="endpoint_server_platforms"
                      color="purple"
                      bgClass="bg-purple-50 dark:bg-purple-900/20"
                      icon={<Monitor className="h-4 w-4 text-purple-600 dark:text-purple-400" />}
                      title={t("accounts.infraDiscovery.categories.endpoint_server_platforms")}
                    >
                      {renderEnumSelect("endpoint_server_platforms.endpoint_os_mix", t("accounts.infraDiscovery.fields.endpointOsMix"), [
                        { value: "windows_only", label: t("accounts.infraDiscovery.options.windowsOnly") },
                        { value: "mostly_windows", label: t("accounts.infraDiscovery.options.mostlyWindows") },
                        { value: "mixed", label: t("accounts.infraDiscovery.options.mixed") },
                        { value: "mac_heavy", label: t("accounts.infraDiscovery.options.macHeavy") },
                      ])}
                      {renderEnumSelect("endpoint_server_platforms.server_os_mix", t("accounts.infraDiscovery.fields.serverOsMix"), [
                        { value: "windows_only", label: t("accounts.infraDiscovery.options.windowsOnly") },
                        { value: "mostly_windows", label: t("accounts.infraDiscovery.options.mostlyWindows") },
                        { value: "mixed", label: t("accounts.infraDiscovery.options.mixed") },
                        { value: "linux_heavy", label: t("accounts.infraDiscovery.options.linuxHeavy") },
                      ])}
                      {renderNumberInput("endpoint_server_platforms.endpoint_count", t("accounts.infraDiscovery.fields.endpointCount"))}
                      {renderEnumSelect("endpoint_server_platforms.remote_workforce_ratio", t("accounts.infraDiscovery.fields.remoteWorkforceRatio"), [
                        { value: "low", label: t("accounts.infraDiscovery.options.low") },
                        { value: "medium", label: t("accounts.infraDiscovery.options.medium") },
                        { value: "high", label: t("accounts.infraDiscovery.options.high") },
                        { value: "unknown", label: t("accounts.infraDiscovery.options.unknown") },
                      ])}
                      {renderEnumSelect("endpoint_server_platforms.endpoint_mgmt_tool", t("accounts.infraDiscovery.fields.endpointMgmtTool"), [
                        { value: "intune", label: "Intune" },
                        { value: "mecm", label: "MECM (SCCM)" },
                        { value: "jamf", label: "Jamf" },
                        { value: "tanium", label: "Tanium" },
                        { value: "other", label: t("accounts.infraDiscovery.options.other") },
                        { value: "none", label: t("accounts.infraDiscovery.options.none") },
                      ])}
                      {renderArrayInput("endpoint_server_platforms.edr_platform", t("accounts.infraDiscovery.fields.edrPlatforms"))}
                      {renderBooleanSwitch("endpoint_server_platforms.agent_allowed", t("accounts.infraDiscovery.fields.agentAllowed"))}
                      {renderBooleanSwitch("endpoint_server_platforms.removable_media_control_required", t("accounts.infraDiscovery.fields.removableMediaControlRequired"))}
                      {renderMultiSelect("endpoint_server_platforms.exfiltration_channels_of_concern", t("accounts.infraDiscovery.fields.exfiltrationChannels"), [
                        { value: "usb", label: t("accounts.infraDiscovery.options.usb") },
                        { value: "email", label: t("accounts.infraDiscovery.options.emailChannel") },
                        { value: "web_upload", label: t("accounts.infraDiscovery.options.webUpload") },
                        { value: "messaging", label: t("accounts.infraDiscovery.options.messaging") },
                        { value: "cloud_sync", label: t("accounts.infraDiscovery.options.cloudSync") },
                        { value: "printing", label: t("accounts.infraDiscovery.options.printing") },
                        { value: "other", label: t("accounts.infraDiscovery.options.other") },
                      ])}
                      {renderEnumSelect("endpoint_server_platforms.local_admin_rights_model", t("accounts.infraDiscovery.fields.localAdminRightsModel"), [
                        { value: "many_local_admins", label: t("accounts.infraDiscovery.options.manyLocalAdmins") },
                        { value: "few", label: t("accounts.infraDiscovery.options.few") },
                        { value: "strictly_controlled", label: t("accounts.infraDiscovery.options.strictlyControlled") },
                        { value: "unknown", label: t("accounts.infraDiscovery.options.unknown") },
                      ])}
                    </StyledAccordionItem>

                    <StyledAccordionItem
                      value="network_connectivity"
                      color="green"
                      bgClass="bg-green-50 dark:bg-green-900/20"
                      icon={<Network className="h-4 w-4 text-green-600 dark:text-green-400" />}
                      title={t("accounts.infraDiscovery.categories.network_connectivity")}
                    >
                      {renderEnumSelect("network_connectivity.egress_model", t("accounts.infraDiscovery.fields.egressModel"), [
                        { value: "open", label: t("accounts.infraDiscovery.options.open") },
                        { value: "proxy_required", label: t("accounts.infraDiscovery.options.proxyRequired") },
                        { value: "allowlist_only", label: t("accounts.infraDiscovery.options.allowlistOnly") },
                        { value: "default_deny", label: t("accounts.infraDiscovery.options.defaultDeny") },
                        { value: "unknown", label: t("accounts.infraDiscovery.options.unknown") },
                      ])}
                      {renderBooleanSwitch("network_connectivity.proxy_in_use", t("accounts.infraDiscovery.fields.proxyInUse"))}
                    </StyledAccordionItem>

                    <StyledAccordionItem
                      value="storage_file_systems"
                      color="amber"
                      bgClass="bg-amber-50 dark:bg-amber-900/20"
                      icon={<Database className="h-4 w-4 text-amber-600 dark:text-amber-400" />}
                      title={t("accounts.infraDiscovery.categories.storage_file_systems")}
                    >
                      {renderMultiSelect("storage_file_systems.data_stores_in_scope", t("accounts.infraDiscovery.fields.dataStoresInScope"), [
                        { value: "windows_file_shares", label: t("accounts.infraDiscovery.options.windowsFileShares") },
                        { value: "nas", label: "NAS" },
                        { value: "sharepoint", label: "SharePoint" },
                        { value: "onedrive", label: "OneDrive" },
                        { value: "teams", label: "Teams" },
                        { value: "exchange", label: "Exchange" },
                        { value: "s3", label: "AWS S3" },
                        { value: "azure_blob", label: "Azure Blob" },
                        { value: "gcs", label: "Google Cloud Storage" },
                        { value: "dbs", label: "Databases" },
                        { value: "other", label: t("accounts.infraDiscovery.options.other") },
                      ])}
                      {renderBooleanSwitch("storage_file_systems.m365_in_scope", t("accounts.infraDiscovery.fields.m365InScope"))}
                      {renderBooleanSwitch("storage_file_systems.file_shares_in_scope", t("accounts.infraDiscovery.fields.fileSharesInScope"))}
                      {renderBooleanSwitch("storage_file_systems.object_storage_in_scope", t("accounts.infraDiscovery.fields.objectStorageInScope"))}
                      {renderBooleanSwitch("storage_file_systems.dfs_in_use", t("accounts.infraDiscovery.fields.dfsInUse"))}
                      {renderNumberInput("storage_file_systems.estimated_data_volume_tb", t("accounts.infraDiscovery.fields.estimatedDataVolumeTb"))}
                      {renderMultiSelect("storage_file_systems.sensitive_data_types", t("accounts.infraDiscovery.fields.sensitiveDataTypes"), [
                        { value: "pii", label: "PII" },
                        { value: "phi", label: "PHI" },
                        { value: "pci", label: "PCI" },
                        { value: "ip", label: "IP" },
                        { value: "financial", label: "Financial" },
                        { value: "credentials", label: "Credentials" },
                        { value: "other", label: t("accounts.infraDiscovery.options.other") },
                      ])}
                      {renderEnumSelect("storage_file_systems.permissions_risk_pattern", t("accounts.infraDiscovery.fields.permissionsRiskPattern"), [
                        { value: "least_privilege", label: t("accounts.infraDiscovery.options.leastPrivilege") },
                        { value: "over_permissive", label: t("accounts.infraDiscovery.options.overPermissive") },
                        { value: "unknown", label: t("accounts.infraDiscovery.options.unknown") },
                      ])}
                      {renderBooleanSwitch("storage_file_systems.classification_already_exists", t("accounts.infraDiscovery.fields.classificationAlreadyExists"))}
                      {renderArrayInput("storage_file_systems.top_priority_repositories", t("accounts.infraDiscovery.fields.topPriorityRepositories"))}
                      {renderEnumSelect("storage_file_systems.primary_db_engine", t("accounts.infraDiscovery.fields.primaryDbEngine"), [
                        { value: "sqlserver", label: "SQL Server" },
                        { value: "postgres", label: "PostgreSQL" },
                        { value: "oracle", label: "Oracle" },
                        { value: "mysql", label: "MySQL" },
                        { value: "managed_cloud", label: t("accounts.infraDiscovery.options.cloudManaged") },
                        { value: "unknown", label: t("accounts.infraDiscovery.options.unknown") },
                      ])}
                      {renderEnumSelect("storage_file_systems.db_hosting_model", t("accounts.infraDiscovery.fields.dbHostingModel"), [
                        { value: "on_prem", label: t("accounts.infraDiscovery.options.onPrem") },
                        { value: "cloud_managed", label: t("accounts.infraDiscovery.options.cloudManaged") },
                        { value: "hybrid", label: t("accounts.infraDiscovery.options.hybrid") },
                        { value: "unknown", label: t("accounts.infraDiscovery.options.unknown") },
                      ])}
                    </StyledAccordionItem>

                    <StyledAccordionItem
                      value="application_landscape"
                      color="cyan"
                      bgClass="bg-cyan-50 dark:bg-cyan-900/20"
                      icon={<Building2 className="h-4 w-4 text-cyan-600 dark:text-cyan-400" />}
                      title={t("accounts.infraDiscovery.categories.application_landscape")}
                    >
                      {renderTextInput("application_landscape.hris_system", t("accounts.infraDiscovery.fields.hrisSystem"))}
                      {renderEnumSelect("application_landscape.itsm_platform", t("accounts.infraDiscovery.fields.itsmPlatform"), [
                        { value: "servicenow", label: "ServiceNow" },
                        { value: "jira", label: "Jira" },
                        { value: "remedy", label: "Remedy" },
                        { value: "other", label: t("accounts.infraDiscovery.options.other") },
                        { value: "none", label: t("accounts.infraDiscovery.options.none") },
                      ])}
                      {renderEnumSelect("application_landscape.m365_adoption_level", t("accounts.infraDiscovery.fields.m365AdoptionLevel"), [
                        { value: "none", label: t("accounts.infraDiscovery.options.none") },
                        { value: "some", label: t("accounts.infraDiscovery.options.some") },
                        { value: "heavy", label: t("accounts.infraDiscovery.options.heavy") },
                        { value: "unknown", label: t("accounts.infraDiscovery.options.unknown") },
                      ])}
                      {renderArrayInput("application_landscape.critical_saas_apps", t("accounts.infraDiscovery.fields.criticalSaasApps"))}
                      {renderEnumSelect("application_landscape.integration_preference", t("accounts.infraDiscovery.fields.integrationPreference"), [
                        { value: "api", label: "API" },
                        { value: "syslog", label: "Syslog" },
                        { value: "webhook", label: "Webhook" },
                        { value: "agent_connector", label: "Agent/Connector" },
                        { value: "unknown", label: t("accounts.infraDiscovery.options.unknown") },
                      ])}
                      {renderEnumSelect("application_landscape.automation_tool_standard", t("accounts.infraDiscovery.fields.automationToolStandard"), [
                        { value: "powershell", label: "PowerShell" },
                        { value: "ansible", label: "Ansible" },
                        { value: "terraform", label: "Terraform" },
                        { value: "none", label: t("accounts.infraDiscovery.options.none") },
                        { value: "mixed", label: t("accounts.infraDiscovery.options.mixed") },
                        { value: "unknown", label: t("accounts.infraDiscovery.options.unknown") },
                      ])}
                      {renderEnumSelect("application_landscape.secrets_management_standard", t("accounts.infraDiscovery.fields.secretsManagementStandard"), [
                        { value: "key_vault", label: "Azure Key Vault" },
                        { value: "vault", label: "HashiCorp Vault" },
                        { value: "aws_secrets", label: "AWS Secrets Manager" },
                        { value: "gcp_secret", label: "GCP Secret Manager" },
                        { value: "none", label: t("accounts.infraDiscovery.options.none") },
                        { value: "unknown", label: t("accounts.infraDiscovery.options.unknown") },
                      ])}
                    </StyledAccordionItem>

                    <StyledAccordionItem
                      value="security_architecture"
                      color="red"
                      bgClass="bg-red-50 dark:bg-red-900/20"
                      icon={<Lock className="h-4 w-4 text-red-600 dark:text-red-400" />}
                      title={t("accounts.infraDiscovery.categories.security_architecture")}
                    >
                      {renderEnumSelect("security_architecture.siem_platform", t("accounts.infraDiscovery.fields.siemPlatform"), [
                        { value: "splunk", label: "Splunk" },
                        { value: "sentinel", label: "Microsoft Sentinel" },
                        { value: "qradar", label: "IBM QRadar" },
                        { value: "sumo", label: "Sumo Logic" },
                        { value: "elastic", label: "Elastic SIEM" },
                        { value: "other", label: t("accounts.infraDiscovery.options.other") },
                        { value: "none", label: t("accounts.infraDiscovery.options.none") },
                      ])}
                      {renderEnumSelect("security_architecture.soar_platform", t("accounts.infraDiscovery.fields.soarPlatform"), [
                        { value: "xsoar", label: "Palo Alto XSOAR" },
                        { value: "sentinel_playbooks", label: "Sentinel Playbooks" },
                        { value: "splunk_soar", label: "Splunk SOAR" },
                        { value: "other", label: t("accounts.infraDiscovery.options.other") },
                        { value: "none", label: t("accounts.infraDiscovery.options.none") },
                      ])}
                      {renderNumberInput("security_architecture.log_retention_days", t("accounts.infraDiscovery.fields.logRetentionDays"))}
                      {renderBooleanSwitch("security_architecture.immutable_logging_required", t("accounts.infraDiscovery.fields.immutableLoggingRequired"))}
                      {renderArrayInput("security_architecture.edr_platform", t("accounts.infraDiscovery.fields.edrPlatforms"))}
                      {renderEnumSelect("security_architecture.vuln_mgmt_tool", t("accounts.infraDiscovery.fields.vulnMgmtTool"), [
                        { value: "tenable", label: "Tenable" },
                        { value: "qualys", label: "Qualys" },
                        { value: "rapid7", label: "Rapid7" },
                        { value: "other", label: t("accounts.infraDiscovery.options.other") },
                        { value: "none", label: t("accounts.infraDiscovery.options.none") },
                      ])}
                      {renderBooleanSwitch("security_architecture.mfa_for_privileged_access", t("accounts.infraDiscovery.fields.mfaForPrivilegedAccess"))}
                      {renderBooleanSwitch("security_architecture.privileged_session_monitoring_required", t("accounts.infraDiscovery.fields.privilegedSessionMonitoringRequired"))}
                      {renderEnumSelect("security_architecture.incident_ticketing_flow", t("accounts.infraDiscovery.fields.incidentTicketingFlow"), [
                        { value: "manual", label: t("accounts.infraDiscovery.options.manual") },
                        { value: "itsm_integrated", label: t("accounts.infraDiscovery.options.itsmIntegrated") },
                        { value: "soar_automated", label: t("accounts.infraDiscovery.options.soarAutomated") },
                        { value: "unknown", label: t("accounts.infraDiscovery.options.unknown") },
                      ])}
                      {renderEnumSelect("security_architecture.security_data_sensitivity_constraints", t("accounts.infraDiscovery.fields.securityDataSensitivity"), [
                        { value: "low", label: t("accounts.infraDiscovery.options.low") },
                        { value: "medium", label: t("accounts.infraDiscovery.options.medium") },
                        { value: "high", label: t("accounts.infraDiscovery.options.high") },
                        { value: "restricted", label: t("accounts.infraDiscovery.options.restricted") },
                      ])}
                    </StyledAccordionItem>

                    <StyledAccordionItem
                      value="operations_service_management"
                      color="gray"
                      bgClass="bg-gray-50 dark:bg-slate-800"
                      icon={<Settings className="h-4 w-4 text-gray-600 dark:text-gray-400" />}
                      title={t("accounts.infraDiscovery.categories.operations_service_management")}
                    >
                      {renderNumberInput("operations_service_management.change_mgmt_lead_time_days", t("accounts.infraDiscovery.fields.changeMgmtLeadTimeDays"))}
                      {renderTextInput("operations_service_management.maintenance_window", t("accounts.infraDiscovery.fields.maintenanceWindow"))}
                      {renderEnumSelect("operations_service_management.monitoring_tool", t("accounts.infraDiscovery.fields.monitoringTool"), [
                        { value: "datadog", label: "Datadog" },
                        { value: "newrelic", label: "New Relic" },
                        { value: "scom", label: "SCOM" },
                        { value: "prometheus", label: "Prometheus" },
                        { value: "other", label: t("accounts.infraDiscovery.options.other") },
                        { value: "none", label: t("accounts.infraDiscovery.options.none") },
                      ])}
                      {renderMultiSelect("operations_service_management.environments_present", t("accounts.infraDiscovery.fields.environmentsPresent"), [
                        { value: "dev", label: t("accounts.infraDiscovery.options.development") },
                        { value: "test", label: t("accounts.infraDiscovery.options.test") },
                        { value: "stage", label: t("accounts.infraDiscovery.options.staging") },
                        { value: "prod", label: t("accounts.infraDiscovery.options.production") },
                        { value: "sandbox", label: t("accounts.infraDiscovery.options.sandbox") },
                      ])}
                    </StyledAccordionItem>

                    <StyledAccordionItem
                      value="cloud_saas_posture"
                      color="sky"
                      bgClass="bg-sky-50 dark:bg-sky-900/20"
                      icon={<Cloud className="h-4 w-4 text-sky-600 dark:text-sky-400" />}
                      title={t("accounts.infraDiscovery.categories.cloud_saas_posture")}
                    >
                      {renderMultiSelect("cloud_saas_posture.cloud_providers", t("accounts.infraDiscovery.fields.cloudProviders"), [
                        { value: "aws", label: "AWS" },
                        { value: "azure", label: "Azure" },
                        { value: "gcp", label: "GCP" },
                      ])}
                      {renderArrayInput("cloud_saas_posture.region_restrictions", t("accounts.infraDiscovery.fields.regionRestrictions"), t("accounts.infraDiscovery.fields.regionRestrictionsPlaceholder"))}
                      {renderEnumSelect("cloud_saas_posture.tenant_model_preference", t("accounts.infraDiscovery.fields.tenantModelPreference"), [
                        { value: "single_tenant", label: t("accounts.infraDiscovery.options.singleTenant") },
                        { value: "multi_tenant", label: t("accounts.infraDiscovery.options.multiTenant") },
                        { value: "either", label: t("accounts.infraDiscovery.options.either") },
                        { value: "unknown", label: t("accounts.infraDiscovery.options.unknown") },
                      ])}
                    </StyledAccordionItem>
                  </Accordion>
                </form>
              </ScrollArea>

              <div className="p-4 border-t bg-background flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                  className="flex-1"
                >
                  <X className="h-4 w-4 mr-2" />
                  {t("common.cancel")}
                </Button>
                <Button
                  onClick={onSave}
                  disabled={updateProfileMutation.isPending}
                  className="flex-1"
                >
                  <Save className="h-4 w-4 mr-2" />
                  {updateProfileMutation.isPending ? t("accounts.infraDiscovery.saving") : t("accounts.infraDiscovery.saveChanges")}
                </Button>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      <ConfirmationDialog
        open={deleteConfirmOpen}
        onOpenChange={setDeleteConfirmOpen}
        title={t("accounts.infraDiscovery.deleteConfirmTitle")}
        description={t("accounts.infraDiscovery.deleteConfirmDescription", { name: selectedProfile?.profileName ?? "" })}
        confirmLabel={t("common.delete")}
        variant="destructive"
        onConfirm={() => deleteProfileMutation.mutate()}
      />
    </>
  );
}
