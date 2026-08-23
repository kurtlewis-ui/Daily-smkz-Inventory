'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { PaymentMethod, PaymentSplit } from './types';

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// A single line in the staff's draft order (the "bag").
export interface DraftItem {
  id: string;
  productId: string;
  name: string;
  brandName: string;
  unitPrice: number;
  quantity: number;
  discount?: number;
  paymentMethod: PaymentMethod;
  bankNote?: string | null;
  note?: string | null;
  paymentSplit?: PaymentSplit | null;
  addedAt?: string;
}

export interface DraftDisposalItem {
  id: string;
  productId: string;
  name: string;
  brandName: string;
  quantity: number;
  reason?: string | null;
  addedAt?: string;
}

export interface DraftExpense {
  amount: number;
  note: string;
  addedAt?: string;
}

interface DraftState {
  items: DraftItem[];
  disposalItems: DraftDisposalItem[];
  expenses: DraftExpense[];
  customerName: string;
  addItem: (item: Omit<DraftItem, 'id' | 'quantity' | 'addedAt'>, quantity?: number) => void;
  setQuantity: (id: string, quantity: number) => void;
  removeItem: (id: string) => void;
  updateItemPayment: (id: string, updates: {
    paymentMethod: PaymentMethod;
    bankNote?: string | null;
    paymentSplit?: PaymentSplit | null;
  }) => void;
  addDisposalItem: (item: Omit<DraftDisposalItem, 'id' | 'quantity'>, quantity?: number) => void;
  setDisposalQuantity: (id: string, quantity: number) => void;
  removeDisposalItem: (id: string) => void;
  addExpense: (expense: DraftExpense) => void;
  removeExpense: (index: number) => void;
  setCustomerName: (name: string) => void;
  clear: () => void;
  replaceAll: (items: DraftItem[], disposalItems: DraftDisposalItem[], expenses: DraftExpense[]) => void;
}

export const useDraftStore = create<DraftState>()(
  persist(
    (set) => ({
      items: [],
      disposalItems: [],
      expenses: [],
      customerName: '',
      addItem: (item, quantity = 1) =>
        set((state) => ({
          items: [...state.items, { ...item, id: generateId(), quantity, addedAt: new Date().toISOString() }],
        })),
      setQuantity: (id, quantity) =>
        set((state) => ({
          items: state.items.map((i) => {
            if (i.id !== id) return i;
            const newQty = Math.max(1, quantity);
            if (i.paymentMethod === 'Split' && i.paymentSplit && newQty !== i.quantity) {
              return { ...i, quantity: newQty, paymentMethod: 'Cash' as PaymentMethod, paymentSplit: null };
            }
            return { ...i, quantity: newQty };
          }),
        })),
      removeItem: (id) =>
        set((state) => ({ items: state.items.filter((i) => i.id !== id) })),

      updateItemPayment: (id, updates) =>
        set((state) => ({
          items: state.items.map((i) =>
            i.id === id ? { ...i, ...updates } : i,
          ),
        })),

      addDisposalItem: (item, quantity = 1) =>
        set((state) => {
          const existing = state.disposalItems.find((i) => i.productId === item.productId);
          if (existing) {
            return {
              disposalItems: state.disposalItems.map((i) =>
                i.productId === item.productId
                  ? { ...i, quantity: i.quantity + quantity }
                  : i,
              ),
            };
          }
          return { disposalItems: [...state.disposalItems, { ...item, id: generateId(), quantity, addedAt: new Date().toISOString() }] };
        }),
      setDisposalQuantity: (id, quantity) =>
        set((state) => ({
          disposalItems: state.disposalItems.map((i) =>
            i.id === id ? { ...i, quantity: Math.max(1, quantity) } : i,
          ),
        })),
      removeDisposalItem: (id) =>
        set((state) => ({
          disposalItems: state.disposalItems.filter((i) => i.id !== id),
        })),

      addExpense: (expense) => set((state) => ({ expenses: [...state.expenses, { ...expense, addedAt: new Date().toISOString() }] })),
      removeExpense: (index) =>
        set((state) => ({ expenses: state.expenses.filter((_, i) => i !== index) })),

      setCustomerName: (name) => set({ customerName: name }),

      clear: () => set({ items: [], disposalItems: [], expenses: [], customerName: '' }),

      replaceAll: (items, disposalItems, expenses) => set({ items, disposalItems, expenses }),
    }),
    {
      name: 'vape-shop-draft',
      storage: {
        getItem: (name) => {
          try {
            const str = localStorage.getItem(name);
            return str ? JSON.parse(str) : null;
          } catch {
            return null;
          }
        },
        setItem: (name, value) => {
          try {
            localStorage.setItem(name, JSON.stringify(value));
          } catch {
            console.warn('Draft could not be saved to localStorage (storage full?)');
          }
        },
        removeItem: (name) => {
          try {
            localStorage.removeItem(name);
          } catch {
            // ignore
          }
        },
      },
    },
  ),
);
