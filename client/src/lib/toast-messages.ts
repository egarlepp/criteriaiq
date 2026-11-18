import { ToastCategory } from "./toast-categories";

export interface ToastMessage {
  titleKey: string;
  descriptionKey?: string;
  category: ToastCategory;
  subcategory?: string;
  variant?: "default" | "destructive" | "success" | "error" | "warning" | "info" | "confirm" | "loading";
  action?: {
    labelKey: string;
    onClick: () => void;
  };
}

export const toastMessages = {
  auth: {
    loginSuccess: {
      titleKey: "toasts.auth.loginSuccess.title",
      descriptionKey: "toasts.auth.loginSuccess.description",
      category: "system" as ToastCategory,
      subcategory: "auth",
      variant: "success" as const,
    },
    loginError: {
      titleKey: "toasts.auth.loginError.title",
      descriptionKey: "toasts.auth.loginError.description",
      category: "system" as ToastCategory,
      subcategory: "auth",
      variant: "error" as const,
    },
    logoutSuccess: {
      titleKey: "toasts.auth.logoutSuccess.title",
      descriptionKey: "toasts.auth.logoutSuccess.description",
      category: "system" as ToastCategory,
      subcategory: "auth",
      variant: "info" as const,
    },
    unauthorized: {
      titleKey: "toasts.auth.unauthorized.title",
      descriptionKey: "toasts.auth.unauthorized.description",
      category: "system" as ToastCategory,
      subcategory: "auth",
      variant: "error" as const,
    },
  },
  
  profile: {
    updateSuccess: {
      titleKey: "toasts.profile.updateSuccess.title",
      descriptionKey: "toasts.profile.updateSuccess.description",
      category: "userActions" as ToastCategory,
      subcategory: "profile",
      variant: "success" as const,
    },
    updateError: {
      titleKey: "toasts.profile.updateError.title",
      descriptionKey: "toasts.profile.updateError.description",
      category: "userActions" as ToastCategory,
      subcategory: "profile",
      variant: "error" as const,
    },
    passwordChanged: {
      titleKey: "toasts.profile.passwordChanged.title",
      descriptionKey: "toasts.profile.passwordChanged.description",
      category: "userActions" as ToastCategory,
      subcategory: "profile",
      variant: "success" as const,
    },
    passwordError: {
      titleKey: "toasts.profile.passwordError.title",
      descriptionKey: "toasts.profile.passwordError.description",
      category: "userActions" as ToastCategory,
      subcategory: "profile",
      variant: "error" as const,
    },
  },

  project: {
    createSuccess: {
      titleKey: "toasts.project.createSuccess.title",
      descriptionKey: "toasts.project.createSuccess.description",
      category: "data" as ToastCategory,
      subcategory: "create",
      variant: "success" as const,
    },
    createError: {
      titleKey: "toasts.project.createError.title",
      descriptionKey: "toasts.project.createError.description",
      category: "data" as ToastCategory,
      subcategory: "create",
      variant: "error" as const,
    },
    updateSuccess: {
      titleKey: "toasts.project.updateSuccess.title",
      descriptionKey: "toasts.project.updateSuccess.description",
      category: "data" as ToastCategory,
      subcategory: "update",
      variant: "success" as const,
    },
    updateError: {
      titleKey: "toasts.project.updateError.title",
      descriptionKey: "toasts.project.updateError.description",
      category: "data" as ToastCategory,
      subcategory: "update",
      variant: "error" as const,
    },
    deleteSuccess: {
      titleKey: "toasts.project.deleteSuccess.title",
      descriptionKey: "toasts.project.deleteSuccess.description",
      category: "data" as ToastCategory,
      subcategory: "delete",
      variant: "warning" as const,
    },
    deleteError: {
      titleKey: "toasts.project.deleteError.title",
      descriptionKey: "toasts.project.deleteError.description",
      category: "data" as ToastCategory,
      subcategory: "delete",
      variant: "error" as const,
    },
  },

  data: {
    saved: {
      titleKey: "toasts.data.saved.title",
      descriptionKey: "toasts.data.saved.description",
      category: "data" as ToastCategory,
      subcategory: "update",
      variant: "success" as const,
    },
    deleted: {
      titleKey: "toasts.data.deleted.title",
      descriptionKey: "toasts.data.deleted.description",
      category: "data" as ToastCategory,
      subcategory: "delete",
      variant: "warning" as const,
    },
    exportSuccess: {
      titleKey: "toasts.data.exportSuccess.title",
      descriptionKey: "toasts.data.exportSuccess.description",
      category: "data" as ToastCategory,
      subcategory: "export",
      variant: "success" as const,
    },
    importSuccess: {
      titleKey: "toasts.data.importSuccess.title",
      descriptionKey: "toasts.data.importSuccess.description",
      category: "data" as ToastCategory,
      subcategory: "import",
      variant: "success" as const,
    },
  },

  validation: {
    required: {
      titleKey: "toasts.validation.required.title",
      descriptionKey: "toasts.validation.required.description",
      category: "validation" as ToastCategory,
      subcategory: "required",
      variant: "warning" as const,
    },
    invalidFormat: {
      titleKey: "toasts.validation.invalidFormat.title",
      descriptionKey: "toasts.validation.invalidFormat.description",
      category: "validation" as ToastCategory,
      subcategory: "format",
      variant: "error" as const,
    },
    duplicate: {
      titleKey: "toasts.validation.duplicate.title",
      descriptionKey: "toasts.validation.duplicate.description",
      category: "validation" as ToastCategory,
      subcategory: "duplicate",
      variant: "warning" as const,
    },
  },

  email: {
    templateCreated: {
      titleKey: "toasts.email.templateCreated.title",
      descriptionKey: "toasts.email.templateCreated.description",
      category: "data" as ToastCategory,
      subcategory: "create",
      variant: "success" as const,
    },
    templateUpdated: {
      titleKey: "toasts.email.templateUpdated.title",
      descriptionKey: "toasts.email.templateUpdated.description",
      category: "data" as ToastCategory,
      subcategory: "update",
      variant: "success" as const,
    },
    templateDeleted: {
      titleKey: "toasts.email.templateDeleted.title",
      descriptionKey: "toasts.email.templateDeleted.description",
      category: "data" as ToastCategory,
      subcategory: "delete",
      variant: "warning" as const,
    },
    sendSuccess: {
      titleKey: "toasts.email.sendSuccess.title",
      descriptionKey: "toasts.email.sendSuccess.description",
      category: "system" as ToastCategory,
      subcategory: "notification",
      variant: "success" as const,
    },
    sendError: {
      titleKey: "toasts.email.sendError.title",
      descriptionKey: "toasts.email.sendError.description",
      category: "system" as ToastCategory,
      subcategory: "notification",
      variant: "error" as const,
    },
  },

  clipboard: {
    copied: {
      titleKey: "toasts.clipboard.copied.title",
      descriptionKey: "toasts.clipboard.copied.description",
      category: "system" as ToastCategory,
      subcategory: "notification",
      variant: "success" as const,
    },
  },

  file: {
    uploadSuccess: {
      titleKey: "toasts.file.uploadSuccess.title",
      descriptionKey: "toasts.file.uploadSuccess.description",
      category: "data" as ToastCategory,
      subcategory: "create",
      variant: "success" as const,
    },
    uploadError: {
      titleKey: "toasts.file.uploadError.title",
      descriptionKey: "toasts.file.uploadError.description",
      category: "data" as ToastCategory,
      subcategory: "create",
      variant: "error" as const,
    },
  },

  report: {
    saveSuccess: {
      titleKey: "toasts.report.saveSuccess.title",
      category: "data" as ToastCategory,
      subcategory: "update",
      variant: "success" as const,
    },
    saveError: {
      titleKey: "toasts.report.saveError.title",
      category: "data" as ToastCategory,
      subcategory: "update",
      variant: "error" as const,
    },
    executeError: {
      titleKey: "toasts.report.executeError.title",
      category: "system" as ToastCategory,
      variant: "error" as const,
    },
    deleteSuccess: {
      titleKey: "toasts.report.deleteSuccess.title",
      category: "data" as ToastCategory,
      subcategory: "delete",
      variant: "warning" as const,
    },
  },

  validationCriteria: {
    solution: {
      createSuccess: {
        titleKey: "toasts.validationCriteria.solution.createSuccess.title",
        descriptionKey: "toasts.validationCriteria.solution.createSuccess.description",
        category: "data" as ToastCategory,
        subcategory: "create",
        variant: "success" as const,
      },
      createError: {
        titleKey: "toasts.validationCriteria.solution.createError.title",
        descriptionKey: "toasts.validationCriteria.solution.createError.description",
        category: "data" as ToastCategory,
        subcategory: "create",
        variant: "error" as const,
      },
      updateSuccess: {
        titleKey: "toasts.validationCriteria.solution.updateSuccess.title",
        descriptionKey: "toasts.validationCriteria.solution.updateSuccess.description",
        category: "data" as ToastCategory,
        subcategory: "update",
        variant: "success" as const,
      },
      updateError: {
        titleKey: "toasts.validationCriteria.solution.updateError.title",
        descriptionKey: "toasts.validationCriteria.solution.updateError.description",
        category: "data" as ToastCategory,
        subcategory: "update",
        variant: "error" as const,
      },
      deleteSuccess: {
        titleKey: "toasts.validationCriteria.solution.deleteSuccess.title",
        descriptionKey: "toasts.validationCriteria.solution.deleteSuccess.description",
        category: "data" as ToastCategory,
        subcategory: "delete",
        variant: "warning" as const,
      },
      deleteError: {
        titleKey: "toasts.validationCriteria.solution.deleteError.title",
        descriptionKey: "toasts.validationCriteria.solution.deleteError.description",
        category: "data" as ToastCategory,
        subcategory: "delete",
        variant: "error" as const,
      },
    },
    component: {
      createSuccess: {
        titleKey: "toasts.validationCriteria.component.createSuccess.title",
        descriptionKey: "toasts.validationCriteria.component.createSuccess.description",
        category: "data" as ToastCategory,
        subcategory: "create",
        variant: "success" as const,
      },
      createError: {
        titleKey: "toasts.validationCriteria.component.createError.title",
        descriptionKey: "toasts.validationCriteria.component.createError.description",
        category: "data" as ToastCategory,
        subcategory: "create",
        variant: "error" as const,
      },
      updateSuccess: {
        titleKey: "toasts.validationCriteria.component.updateSuccess.title",
        descriptionKey: "toasts.validationCriteria.component.updateSuccess.description",
        category: "data" as ToastCategory,
        subcategory: "update",
        variant: "success" as const,
      },
      updateError: {
        titleKey: "toasts.validationCriteria.component.updateError.title",
        descriptionKey: "toasts.validationCriteria.component.updateError.description",
        category: "data" as ToastCategory,
        subcategory: "update",
        variant: "error" as const,
      },
      deleteSuccess: {
        titleKey: "toasts.validationCriteria.component.deleteSuccess.title",
        descriptionKey: "toasts.validationCriteria.component.deleteSuccess.description",
        category: "data" as ToastCategory,
        subcategory: "delete",
        variant: "warning" as const,
      },
      deleteError: {
        titleKey: "toasts.validationCriteria.component.deleteError.title",
        descriptionKey: "toasts.validationCriteria.component.deleteError.description",
        category: "data" as ToastCategory,
        subcategory: "delete",
        variant: "error" as const,
      },
    },
    criteria: {
      createSuccess: {
        titleKey: "toasts.validationCriteria.criteria.createSuccess.title",
        descriptionKey: "toasts.validationCriteria.criteria.createSuccess.description",
        category: "data" as ToastCategory,
        subcategory: "create",
        variant: "success" as const,
      },
      createError: {
        titleKey: "toasts.validationCriteria.criteria.createError.title",
        descriptionKey: "toasts.validationCriteria.criteria.createError.description",
        category: "data" as ToastCategory,
        subcategory: "create",
        variant: "error" as const,
      },
      updateSuccess: {
        titleKey: "toasts.validationCriteria.criteria.updateSuccess.title",
        descriptionKey: "toasts.validationCriteria.criteria.updateSuccess.description",
        category: "data" as ToastCategory,
        subcategory: "update",
        variant: "success" as const,
      },
      updateError: {
        titleKey: "toasts.validationCriteria.criteria.updateError.title",
        descriptionKey: "toasts.validationCriteria.criteria.updateError.description",
        category: "data" as ToastCategory,
        subcategory: "update",
        variant: "error" as const,
      },
      deleteSuccess: {
        titleKey: "toasts.validationCriteria.criteria.deleteSuccess.title",
        descriptionKey: "toasts.validationCriteria.criteria.deleteSuccess.description",
        category: "data" as ToastCategory,
        subcategory: "delete",
        variant: "warning" as const,
      },
      deleteError: {
        titleKey: "toasts.validationCriteria.criteria.deleteError.title",
        descriptionKey: "toasts.validationCriteria.criteria.deleteError.description",
        category: "data" as ToastCategory,
        subcategory: "delete",
        variant: "error" as const,
      },
    },
    outcome: {
      createSuccess: {
        titleKey: "toasts.validationCriteria.outcome.createSuccess.title",
        descriptionKey: "toasts.validationCriteria.outcome.createSuccess.description",
        category: "data" as ToastCategory,
        subcategory: "create",
        variant: "success" as const,
      },
      createError: {
        titleKey: "toasts.validationCriteria.outcome.createError.title",
        descriptionKey: "toasts.validationCriteria.outcome.createError.description",
        category: "data" as ToastCategory,
        subcategory: "create",
        variant: "error" as const,
      },
      updateSuccess: {
        titleKey: "toasts.validationCriteria.outcome.updateSuccess.title",
        descriptionKey: "toasts.validationCriteria.outcome.updateSuccess.description",
        category: "data" as ToastCategory,
        subcategory: "update",
        variant: "success" as const,
      },
      updateError: {
        titleKey: "toasts.validationCriteria.outcome.updateError.title",
        descriptionKey: "toasts.validationCriteria.outcome.updateError.description",
        category: "data" as ToastCategory,
        subcategory: "update",
        variant: "error" as const,
      },
      deleteSuccess: {
        titleKey: "toasts.validationCriteria.outcome.deleteSuccess.title",
        descriptionKey: "toasts.validationCriteria.outcome.deleteSuccess.description",
        category: "data" as ToastCategory,
        subcategory: "delete",
        variant: "warning" as const,
      },
      deleteError: {
        titleKey: "toasts.validationCriteria.outcome.deleteError.title",
        descriptionKey: "toasts.validationCriteria.outcome.deleteError.description",
        category: "data" as ToastCategory,
        subcategory: "delete",
        variant: "error" as const,
      },
    },
    action: {
      createSuccess: {
        titleKey: "toasts.validationCriteria.action.createSuccess.title",
        descriptionKey: "toasts.validationCriteria.action.createSuccess.description",
        category: "data" as ToastCategory,
        subcategory: "create",
        variant: "success" as const,
      },
      createError: {
        titleKey: "toasts.validationCriteria.action.createError.title",
        descriptionKey: "toasts.validationCriteria.action.createError.description",
        category: "data" as ToastCategory,
        subcategory: "create",
        variant: "error" as const,
      },
      updateSuccess: {
        titleKey: "toasts.validationCriteria.action.updateSuccess.title",
        descriptionKey: "toasts.validationCriteria.action.updateSuccess.description",
        category: "data" as ToastCategory,
        subcategory: "update",
        variant: "success" as const,
      },
      updateError: {
        titleKey: "toasts.validationCriteria.action.updateError.title",
        descriptionKey: "toasts.validationCriteria.action.updateError.description",
        category: "data" as ToastCategory,
        subcategory: "update",
        variant: "error" as const,
      },
      deleteSuccess: {
        titleKey: "toasts.validationCriteria.action.deleteSuccess.title",
        descriptionKey: "toasts.validationCriteria.action.deleteSuccess.description",
        category: "data" as ToastCategory,
        subcategory: "delete",
        variant: "warning" as const,
      },
      deleteError: {
        titleKey: "toasts.validationCriteria.action.deleteError.title",
        descriptionKey: "toasts.validationCriteria.action.deleteError.description",
        category: "data" as ToastCategory,
        subcategory: "delete",
        variant: "error" as const,
      },
    },
    template: {
      createSuccess: {
        titleKey: "toasts.validationCriteria.template.createSuccess.title",
        descriptionKey: "toasts.validationCriteria.template.createSuccess.description",
        category: "data" as ToastCategory,
        subcategory: "create",
        variant: "success" as const,
      },
      createError: {
        titleKey: "toasts.validationCriteria.template.createError.title",
        descriptionKey: "toasts.validationCriteria.template.createError.description",
        category: "data" as ToastCategory,
        subcategory: "create",
        variant: "error" as const,
      },
      updateSuccess: {
        titleKey: "toasts.validationCriteria.template.updateSuccess.title",
        descriptionKey: "toasts.validationCriteria.template.updateSuccess.description",
        category: "data" as ToastCategory,
        subcategory: "update",
        variant: "success" as const,
      },
      updateError: {
        titleKey: "toasts.validationCriteria.template.updateError.title",
        descriptionKey: "toasts.validationCriteria.template.updateError.description",
        category: "data" as ToastCategory,
        subcategory: "update",
        variant: "error" as const,
      },
      deleteSuccess: {
        titleKey: "toasts.validationCriteria.template.deleteSuccess.title",
        descriptionKey: "toasts.validationCriteria.template.deleteSuccess.description",
        category: "data" as ToastCategory,
        subcategory: "delete",
        variant: "warning" as const,
      },
      deleteError: {
        titleKey: "toasts.validationCriteria.template.deleteError.title",
        descriptionKey: "toasts.validationCriteria.template.deleteError.description",
        category: "data" as ToastCategory,
        subcategory: "delete",
        variant: "error" as const,
      },
      starError: {
        titleKey: "toasts.validationCriteria.template.starError.title",
        descriptionKey: "toasts.validationCriteria.template.starError.description",
        category: "data" as ToastCategory,
        subcategory: "update",
        variant: "error" as const,
      },
    },
  },
};
