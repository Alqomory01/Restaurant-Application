"use client";

import { useEffect, useState } from "react";
import { Pencil, Plus, Search, Trash2 } from "lucide-react";
import { api, errorMessage } from "@/lib/api";
import type { Recipe } from "@/lib/types";
import { formatCurrency } from "@/lib/format";
import { usePos } from "@/lib/pos/PosContext";
import { counterAvailability, TAX_RATE, type MenuItem, type ModifierGroup } from "@/lib/pos/types";
import { Badge, Button, Card, Chip, EmptyState } from "@/components/ui";
import { Combobox } from "@/components/Combobox";

const inputCls = "w-full rounded-md border border-border-2 px-2 py-1.5";
const availabilityLabel: Record<MenuItem["availability"], string> = {
  ALL_DAY: "All day",
  BREAKFAST: "Breakfast",
  LUNCH: "Lunch",
  DINNER: "Dinner",
};
const availabilityTone: Record<string, "success" | "warning" | "danger"> = {
  AVAILABLE: "success",
  LOW: "warning",
  SOLD_OUT: "danger",
};
const EMOJI_SUGGESTIONS = ["🍚", "🍗", "🍢", "🍲", "🍌", "🍹", "🍽️", "🍛", "🥘", "🍖", "🥤", "🍨"];

type Mode = { kind: "list" } | { kind: "new" } | { kind: "edit"; item: MenuItem };

export default function MenuManagementPage() {
  const { menuItems, addMenuItem, updateMenuItem } = usePos();
  const [mode, setMode] = useState<Mode>({ kind: "list" });
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [activeOnly, setActiveOnly] = useState(false);

  const categories = Array.from(new Set(menuItems.map((i) => i.category)));
  const filtered = menuItems.filter((i) => {
    if (category && i.category !== category) return false;
    if (activeOnly && !i.active) return false;
    if (search && !i.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  if (mode.kind === "new") {
    return <MenuItemForm onCancel={() => setMode({ kind: "list" })} onSave={async (input) => { await addMenuItem(input); setMode({ kind: "list" }); }} />;
  }
  if (mode.kind === "edit") {
    return (
      <MenuItemForm
        item={mode.item}
        onCancel={() => setMode({ kind: "list" })}
        onSave={async (input) => { await updateMenuItem(mode.item.id, input); setMode({ kind: "list" }); }}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-2">
        <Search className="h-4 w-4 shrink-0 text-ink-faint" strokeWidth={2} />
        <input className="flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-ink-faint" placeholder="Search menu items…" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          <Chip active={category === null && !activeOnly} onClick={() => { setCategory(null); setActiveOnly(false); }}>All ({menuItems.length})</Chip>
          {categories.map((c) => (
            <Chip key={c} active={category === c} onClick={() => setCategory(category === c ? null : c)}>{c}</Chip>
          ))}
          <Chip active={activeOnly} onClick={() => setActiveOnly((v) => !v)}>Active only</Chip>
        </div>
        <Button variant="primary" onClick={() => setMode({ kind: "new" })}>
          <Plus className="h-3.5 w-3.5" strokeWidth={2} /> Add menu item
        </Button>
      </div>

      <Card className="p-0">
        {filtered.length === 0 ? (
          <div className="p-4"><EmptyState>No menu items match.</EmptyState></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-ink-soft">
                  <th className="p-3">Item</th>
                  <th className="p-3">Category</th>
                  <th className="p-3">Price</th>
                  <th className="p-3">Availability</th>
                  <th className="p-3">Counter stock</th>
                  <th className="p-3">Status</th>
                  <th className="p-3"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((item) => {
                  const status = counterAvailability(item);
                  return (
                    <tr key={item.id} className="border-t border-border">
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <span className="text-lg">{item.emoji}</span>
                          <div>
                            <div className="font-medium text-ink">{item.name}</div>
                            {item.recipeName && <div className="text-ink-faint">Linked: {item.recipeName}</div>}
                          </div>
                        </div>
                      </td>
                      <td className="p-3"><span className="rounded-md border border-border bg-surface-2 px-1.5 py-0.5 text-ink-soft">{item.category}</span></td>
                      <td className="p-3 text-ink-soft">{formatCurrency(item.sellingPrice)}</td>
                      <td className="p-3 text-ink-soft">{availabilityLabel[item.availability]}</td>
                      <td className="p-3 text-ink-soft">{item.counterQty}</td>
                      <td className="p-3">
                        <div className="flex gap-1">
                          <Badge tone={availabilityTone[status]}>{status.replace("_", " ")}</Badge>
                          {!item.active && <Badge tone="neutral">Inactive</Badge>}
                        </div>
                      </td>
                      <td className="p-3 text-right">
                        <Button onClick={() => setMode({ kind: "edit", item })}><Pencil className="h-3.5 w-3.5" strokeWidth={2} /> Edit</Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <p className="text-xs text-ink-faint">Showing {filtered.length} of {menuItems.length} menu items</p>
    </div>
  );
}

function MenuItemForm({ item, onCancel, onSave }: { item?: MenuItem; onCancel: () => void; onSave: (input: Omit<MenuItem, "id">) => Promise<void> }) {
  const { menuItems } = usePos();
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [recipesError, setRecipesError] = useState<string | null>(null);

  const [name, setName] = useState(item?.name ?? "");
  const [description, setDescription] = useState(item?.description ?? "");
  const [recipeId, setRecipeId] = useState<number | "">(item?.recipeId ?? "");
  const [category, setCategory] = useState(item?.category ?? "");
  const [emoji, setEmoji] = useState(item?.emoji ?? "🍽️");
  const [sellingPrice, setSellingPrice] = useState(String(item?.sellingPrice ?? 0));
  const [availability, setAvailability] = useState<MenuItem["availability"]>(item?.availability ?? "ALL_DAY");
  const [active, setActive] = useState(item?.active ?? true);
  const [counterQty, setCounterQty] = useState(String(item?.counterQty ?? 0));
  const [lowStockThreshold, setLowStockThreshold] = useState(String(item?.lowStockThreshold ?? 5));
  const [modifierGroups, setModifierGroups] = useState<ModifierGroup[]>(item?.modifierGroups ?? []);

  const [isCombo, setIsCombo] = useState(item?.combo != null);
  const [comboItemIds, setComboItemIds] = useState<number[]>(item?.combo?.itemIds ?? []);
  const [comboPrice, setComboPrice] = useState(String(item?.combo?.comboPrice ?? 0));

  const [hasHappyHour, setHasHappyHour] = useState(item?.happyHour != null);
  const [happyStart, setHappyStart] = useState(item?.happyHour?.startTime ?? "16:00");
  const [happyEnd, setHappyEnd] = useState(item?.happyHour?.endTime ?? "18:00");
  const [happyPrice, setHappyPrice] = useState(String(item?.happyHour?.price ?? 0));

  const [hasBulkDiscount, setHasBulkDiscount] = useState(item?.bulkDiscount != null);
  const [bulkMinQty, setBulkMinQty] = useState(String(item?.bulkDiscount?.minQty ?? 5));
  const [bulkPct, setBulkPct] = useState(String(item?.bulkDiscount?.pct ?? 10));

  const [hasStaffMeal, setHasStaffMeal] = useState(item?.staffMealPrice != null);
  const [staffMealPrice, setStaffMealPrice] = useState(String(item?.staffMealPrice ?? 0));

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<{ results?: Recipe[] } | Recipe[]>("/kitchen/recipes/")
      .then((data) => setRecipes(Array.isArray(data) ? data : data.results ?? []))
      .catch((err) => setRecipesError(errorMessage(err, "Could not load Kitchen recipes — link one later.")));
  }, []);

  const canSave = name.trim() && category.trim() && (isCombo ? comboItemIds.length > 0 && Number(comboPrice) > 0 : Number(sellingPrice) >= 0);

  function addModifierGroup() {
    setModifierGroups((prev) => [...prev, { id: Date.now(), name: "", options: [{ label: "", priceDelta: 0 }] }]);
  }
  function updateGroup(id: number, patch: Partial<ModifierGroup>) {
    setModifierGroups((prev) => prev.map((g) => (g.id === id ? { ...g, ...patch } : g)));
  }
  function removeGroup(id: number) {
    setModifierGroups((prev) => prev.filter((g) => g.id !== id));
  }
  function addOption(groupId: number) {
    setModifierGroups((prev) => prev.map((g) => (g.id === groupId ? { ...g, options: [...g.options, { label: "", priceDelta: 0 }] } : g)));
  }
  function updateOption(groupId: number, idx: number, patch: Partial<{ label: string; priceDelta: number }>) {
    setModifierGroups((prev) =>
      prev.map((g) => (g.id === groupId ? { ...g, options: g.options.map((o, i) => (i === idx ? { ...o, ...patch } : o)) } : g))
    );
  }
  function removeOption(groupId: number, idx: number) {
    setModifierGroups((prev) => prev.map((g) => (g.id === groupId ? { ...g, options: g.options.filter((_, i) => i !== idx) } : g)));
  }

  async function handleSave() {
    setSubmitting(true);
    setError(null);
    try {
      const linkedRecipe = recipes.find((r) => r.id === recipeId);
      await onSave({
        name,
        description,
        recipeId: recipeId || null,
        recipeName: linkedRecipe?.name ?? item?.recipeName ?? null,
        category,
        emoji,
        sellingPrice: isCombo ? Number(comboPrice) || 0 : Number(sellingPrice) || 0,
        availability,
        modifierGroups: modifierGroups
          .filter((g) => g.name.trim())
          .map((g) => ({ ...g, options: g.options.filter((o) => o.label.trim()) })),
        combo: isCombo ? { itemIds: comboItemIds, comboPrice: Number(comboPrice) || 0 } : null,
        active,
        happyHour: hasHappyHour ? { startTime: happyStart, endTime: happyEnd, price: Number(happyPrice) || 0 } : null,
        bulkDiscount: hasBulkDiscount ? { minQty: Number(bulkMinQty) || 1, pct: Number(bulkPct) || 0 } : null,
        staffMealPrice: hasStaffMeal ? Number(staffMealPrice) || 0 : null,
        counterQty: Number(counterQty) || 0,
        lowStockThreshold: Number(lowStockThreshold) || 0,
      });
    } catch (err) {
      setError(errorMessage(err, "Failed to save menu item."));
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <div className="mb-4 text-sm font-bold text-ink">{item ? `Edit ${item.name}` : "New menu item"}</div>
        <div className="grid grid-cols-1 gap-3 text-xs sm:grid-cols-2">
          <Field label="Item name *"><input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} /></Field>
          <Field label="Category *"><input className={inputCls} value={category} onChange={(e) => setCategory(e.target.value)} placeholder="e.g. Proteins" /></Field>
          <Field label="Description" full><input className={inputCls} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Shown to customers" /></Field>
          <Field label="Linked Kitchen recipe">
            <Combobox
              placeholder={recipesError ? "Recipes unavailable" : "Select recipe…"}
              value={recipeId}
              onChange={setRecipeId}
              options={recipes.map((r) => ({ value: r.id, label: r.name, sublabel: r.category }))}
            />
            {recipesError && <p className="mt-1 text-danger">{recipesError}</p>}
          </Field>
          <Field label="Emoji (image stand-in)">
            <div className="flex items-center gap-2">
              <input className="w-16 rounded-md border border-border-2 px-2 py-1.5 text-center text-lg" value={emoji} onChange={(e) => setEmoji(e.target.value)} />
              <div className="flex flex-wrap gap-1">
                {EMOJI_SUGGESTIONS.map((e) => (
                  <button key={e} type="button" onClick={() => setEmoji(e)} className="rounded border border-border-2 px-1.5 py-1 text-base hover:bg-surface-2">{e}</button>
                ))}
              </div>
            </div>
          </Field>
          <Field label="Availability schedule">
            <select className={inputCls} value={availability} onChange={(e) => setAvailability(e.target.value as MenuItem["availability"])}>
              {(Object.keys(availabilityLabel) as MenuItem["availability"][]).map((a) => <option key={a} value={a}>{availabilityLabel[a]}</option>)}
            </select>
          </Field>
          {!isCombo && (
            <Field label="Selling price (ex. VAT) *">
              <input type="number" className={inputCls} value={sellingPrice} onChange={(e) => setSellingPrice(e.target.value)} />
              <p className="mt-1 text-ink-faint">Inclusive of {(TAX_RATE * 100).toFixed(1)}% VAT: {formatCurrency(Number(sellingPrice) * (1 + TAX_RATE))}</p>
            </Field>
          )}
          <Field label="Counter stock on hand"><input type="number" className={inputCls} value={counterQty} onChange={(e) => setCounterQty(e.target.value)} /></Field>
          <Field label="Low-stock highlight threshold"><input type="number" className={inputCls} value={lowStockThreshold} onChange={(e) => setLowStockThreshold(e.target.value)} /></Field>
          <Field label="Active">
            <label className="flex items-center gap-2 py-1.5">
              <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
              <span className="text-ink-soft">{active ? "On sale" : "Removed from sale (kept, not deleted)"}</span>
            </label>
          </Field>
        </div>
      </Card>

      <Card>
        <div className="mb-3 text-sm font-bold text-ink">Modifiers</div>
        <div className="space-y-3">
          {modifierGroups.map((g) => (
            <div key={g.id} className="rounded-md border border-border p-2.5 text-xs">
              <div className="mb-2 flex items-center gap-2">
                <input className="flex-1 rounded-md border border-border-2 px-2 py-1.5" placeholder="Group name, e.g. Portion size" value={g.name} onChange={(e) => updateGroup(g.id, { name: e.target.value })} />
                <button onClick={() => removeGroup(g.id)} className="text-ink-faint hover:text-danger"><Trash2 className="h-3.5 w-3.5" strokeWidth={2} /></button>
              </div>
              <div className="space-y-1.5">
                {g.options.map((o, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <input className="flex-1 rounded-md border border-border-2 px-2 py-1" placeholder="Option label" value={o.label} onChange={(e) => updateOption(g.id, idx, { label: e.target.value })} />
                    <input type="number" className="w-24 rounded-md border border-border-2 px-2 py-1" placeholder="+₦" value={o.priceDelta || ""} onChange={(e) => updateOption(g.id, idx, { priceDelta: Number(e.target.value) || 0 })} />
                    <button onClick={() => removeOption(g.id, idx)} className="text-ink-faint hover:text-danger"><Trash2 className="h-3 w-3" strokeWidth={2} /></button>
                  </div>
                ))}
              </div>
              <Button className="mt-2" onClick={() => addOption(g.id)}><Plus className="h-3 w-3" strokeWidth={2} /> Add option</Button>
            </div>
          ))}
          <Button onClick={addModifierGroup}><Plus className="h-3.5 w-3.5" strokeWidth={2} /> Add modifier group</Button>
        </div>
      </Card>

      <Card>
        <div className="mb-3 text-sm font-bold text-ink">Combo configuration</div>
        <label className="mb-3 flex items-center gap-2 text-xs">
          <input type="checkbox" checked={isCombo} onChange={(e) => setIsCombo(e.target.checked)} />
          <span className="text-ink-soft">This item is a combo bundling other menu items</span>
        </label>
        {isCombo && (
          <div className="space-y-3 text-xs">
            <div className="flex flex-wrap gap-1.5">
              {menuItems.filter((m) => m.id !== item?.id && !m.combo).map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setComboItemIds((prev) => (prev.includes(m.id) ? prev.filter((id) => id !== m.id) : [...prev, m.id]))}
                  className={`rounded-full border px-3 py-1.5 font-semibold transition ${comboItemIds.includes(m.id) ? "border-brand bg-brand-light text-brand" : "border-border-2 text-ink-soft hover:bg-surface-2"}`}
                >
                  {m.emoji} {m.name}
                </button>
              ))}
            </div>
            <Field label="Combo price *"><input type="number" className={inputCls} value={comboPrice} onChange={(e) => setComboPrice(e.target.value)} /></Field>
          </div>
        )}
      </Card>

      <Card>
        <div className="mb-3 text-sm font-bold text-ink">Dynamic pricing</div>
        <div className="space-y-3 text-xs">
          <label className="flex items-center gap-2"><input type="checkbox" checked={hasHappyHour} onChange={(e) => setHasHappyHour(e.target.checked)} /><span className="text-ink-soft">Happy hour pricing</span></label>
          {hasHappyHour && (
            <div className="grid grid-cols-3 gap-2 pl-6">
              <Field label="Start"><input type="time" className={inputCls} value={happyStart} onChange={(e) => setHappyStart(e.target.value)} /></Field>
              <Field label="End"><input type="time" className={inputCls} value={happyEnd} onChange={(e) => setHappyEnd(e.target.value)} /></Field>
              <Field label="Price"><input type="number" className={inputCls} value={happyPrice} onChange={(e) => setHappyPrice(e.target.value)} /></Field>
            </div>
          )}
          <label className="flex items-center gap-2"><input type="checkbox" checked={hasBulkDiscount} onChange={(e) => setHasBulkDiscount(e.target.checked)} /><span className="text-ink-soft">Bulk discount</span></label>
          {hasBulkDiscount && (
            <div className="grid grid-cols-2 gap-2 pl-6">
              <Field label="Min quantity"><input type="number" className={inputCls} value={bulkMinQty} onChange={(e) => setBulkMinQty(e.target.value)} /></Field>
              <Field label="Discount %"><input type="number" className={inputCls} value={bulkPct} onChange={(e) => setBulkPct(e.target.value)} /></Field>
            </div>
          )}
          <label className="flex items-center gap-2"><input type="checkbox" checked={hasStaffMeal} onChange={(e) => setHasStaffMeal(e.target.checked)} /><span className="text-ink-soft">Staff meal price (role-restricted)</span></label>
          {hasStaffMeal && (
            <div className="pl-6">
              <Field label="Staff price"><input type="number" className={inputCls} value={staffMealPrice} onChange={(e) => setStaffMealPrice(e.target.value)} /></Field>
            </div>
          )}
        </div>
      </Card>

      {error && <p className="text-xs text-danger">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button onClick={onCancel}>Cancel</Button>
        <Button variant="primary" onClick={handleSave} disabled={!canSave || submitting}>{submitting ? "Saving…" : item ? "Save changes" : "Save menu item"}</Button>
      </div>
    </div>
  );
}

function Field({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
  return (
    <div className={`space-y-1 ${full ? "sm:col-span-2" : ""}`}>
      <label className="font-semibold text-ink-soft">{label}</label>
      {children}
    </div>
  );
}
