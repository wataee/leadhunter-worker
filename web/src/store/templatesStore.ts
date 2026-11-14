import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { PitchTemplate } from '../types';
import { DEFAULT_TEMPLATES } from '../lib/templates';

interface TemplatesState {
  templates: PitchTemplate[];
  setTemplates: (templates: PitchTemplate[]) => void;
  addTemplate: (template: Omit<PitchTemplate, 'id'>) => void;
  updateTemplate: (id: string, updates: Partial<PitchTemplate>) => void;
  duplicateTemplate: (id: string) => void;
  deleteTemplate: (id: string) => void;
  resetToDefaults: () => void;
}

export const useTemplatesStore = create<TemplatesState>()(
  persist(
    (set) => ({
      templates: DEFAULT_TEMPLATES,

      setTemplates: (templates) => set({ templates }),

      addTemplate: (template) =>
        set((state) => ({
          templates: [
            ...state.templates,
            {
              ...template,
              id: `tpl_custom_${Date.now()}`,
              isCustom: true,
            },
          ],
        })),

      updateTemplate: (id, updates) =>
        set((state) => ({
          templates: state.templates.map((t) => (t.id === id ? { ...t, ...updates } : t)),
        })),

      duplicateTemplate: (id) =>
        set((state) => {
          const item = state.templates.find((t) => t.id === id);
          if (!item) return state;
          const copy: PitchTemplate = {
            ...item,
            id: `tpl_copy_${Date.now()}`,
            title: `${item.title} (копия)`,
            isCustom: true,
          };
          return { templates: [...state.templates, copy] };
        }),

      deleteTemplate: (id) =>
        set((state) => ({
          templates: state.templates.filter((t) => t.id !== id),
        })),

      resetToDefaults: () =>
        set({
          templates: DEFAULT_TEMPLATES,
        }),
    }),
    {
      name: 'leadhunter_templates',
    }
  )
);
