import { useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ArrowLeft, Save, Edit2, X, Plus, Pencil, Trash2, Package } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';
import { api } from '@/services/api';
import { useTables, useStockLevels, useWorkspace } from '@/context/workspace-context';
import { totalsByVariant } from '@/lib/reports';
import ProductVariationDialog from './variations-dialog';
import { parseAttributes, parseProductData, isLowStock } from './helpers';

const SPEC_ROWS = [
  { key: 'lengthRange', label: 'Length Range' },
  { key: 'material', label: 'Material' },
  { key: 'finish', label: 'Finish' },
  { key: 'headType', label: 'Head Type' },
  { key: 'threadType', label: 'Thread Type' },
  { key: 'packageQuantity', label: 'Package Quantity' },
];

const FREEFORM_SPECS = [
  { key: 'material', title: 'Material' },
  { key: 'assortment', title: 'Assortment' },
  { key: 'applications', title: 'Applications' },
];

const errText = (err) => String(err?.message || err);

/** Per-variant stock table: one row per branch plus a total. */
const VariantStockTable = ({ variant, branches, levels }) => {
  const byBranch = new Map(
    levels.filter((l) => l.variant_id === variant.id).map((l) => [l.branch_id, Number(l.qty)]),
  );
  const total = [...byBranch.values()].reduce((s, q) => s + q, 0);
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-neutral-200 dark:border-neutral-700">
          <th className="py-1.5 text-left font-medium text-neutral-500">Branch</th>
          <th className="py-1.5 text-right font-medium text-neutral-500">Qty</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
        {branches.map((b) => (
          <tr key={b.id}>
            <td className="py-1.5 text-neutral-600 dark:text-neutral-400">{b.name}</td>
            <td className="py-1.5 text-right font-medium">{byBranch.get(b.id) || 0}</td>
          </tr>
        ))}
        <tr className="border-t border-neutral-200 dark:border-neutral-700">
          <td className="py-1.5 font-medium">Total</td>
          <td className="py-1.5 text-right font-semibold">
            {total}
            {isLowStock(variant, total) && (
              <Badge variant="destructive" className="ml-2">
                Low
              </Badge>
            )}
          </td>
        </tr>
      </tbody>
    </table>
  );
};

const ProductPage = () => {
  const { id } = useParams();
  const { fmtMoney } = useWorkspace();
  const { data, loading } = useTables('products', 'product_variants', 'categories', 'branches');
  const levels = useStockLevels();

  const [draft, setDraft] = useState(null); // non-null while editing
  const [saving, setSaving] = useState(false);
  const [variationDialogOpen, setVariationDialogOpen] = useState(false);
  const [selectedVariant, setSelectedVariant] = useState(null);

  const product = useMemo(() => (data.products || []).find((p) => p.id === id), [data.products, id]);
  const variants = useMemo(
    () => (data.product_variants || []).filter((v) => v.product_id === id),
    [data.product_variants, id],
  );
  const categories = data.categories || [];
  const branches = useMemo(
    () => (data.branches || []).filter((b) => b.is_active !== 0 && b.is_active !== false),
    [data.branches],
  );
  const stockTotals = useMemo(() => totalsByVariant(levels), [levels]);
  const categoryName = categories.find((c) => c.id === product?.category_id)?.name;

  const startEditing = () =>
    setDraft({
      name: product.name || '',
      description: product.description || '',
      category_id: product.category_id || '',
      product_data: parseProductData(product.product_data),
    });

  const setSpec = (key, value) =>
    setDraft((prev) => ({
      ...prev,
      product_data: {
        ...prev.product_data,
        specifications: { ...prev.product_data.specifications, [key]: value },
      },
    }));

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await api.putRow('products', id, {
        name: draft.name.trim(),
        description: draft.description,
        category_id: draft.category_id,
        product_data: JSON.stringify(draft.product_data),
        updated_at: new Date().toISOString(),
      });
      toast({ title: 'Product updated' });
      setDraft(null);
    } catch (err) {
      toast({ title: 'Failed to update product', description: errText(err), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const saveVariant = async (payload) => {
    try {
      await api.putRow('product_variants', selectedVariant?.id || null, {
        ...payload,
        product_id: id,
      });
      toast({ title: selectedVariant ? 'Variation updated' : 'Variation created' });
    } catch (err) {
      toast({ title: 'Failed to save variation', description: errText(err), variant: 'destructive' });
      throw err;
    }
  };

  const deleteVariant = async (variant) => {
    if (!window.confirm(`Delete variation "${variant.name}"?`)) return;
    try {
      await api.deleteRow('product_variants', variant.id);
      toast({ title: 'Variation deleted' });
    } catch (err) {
      toast({
        title: 'Failed to delete variation',
        description: errText(err),
        variant: 'destructive',
      });
    }
  };

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center">Loading...</div>;
  }

  if (!product) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4">
        <p className="text-lg text-neutral-600 dark:text-neutral-400">Product not found.</p>
        <Link to="/products" className="text-sm font-medium text-blue-600 hover:text-blue-700">
          Back to Products
        </Link>
      </div>
    );
  }

  const isEditing = !!draft;
  const productData = isEditing ? draft.product_data : parseProductData(product.product_data);
  const specifications = productData.specifications;

  return (
    <main className="min-h-screen bg-white dark:bg-neutral-900">
      {/* Back Button and Edit Controls */}
      <div className="border-b border-neutral-100 dark:border-neutral-800">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-8 py-4">
          <Link
            to="/products"
            className="inline-flex items-center text-sm font-medium text-blue-600 transition-colors hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Products
          </Link>
          <div className="flex gap-2">
            {isEditing ? (
              <>
                <Button onClick={() => setDraft(null)} variant="outline" disabled={saving}>
                  <X className="mr-2 h-4 w-4" />
                  Cancel
                </Button>
                <Button onClick={handleSave} disabled={saving || !draft.name.trim()}>
                  <Save className="mr-2 h-4 w-4" />
                  {saving ? 'Saving…' : 'Save Changes'}
                </Button>
              </>
            ) : (
              <Button onClick={startEditing}>
                <Edit2 className="mr-2 h-4 w-4" />
                Edit Product
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="mx-auto max-w-7xl px-8 py-12">
        {/* Top Section - Title, Description, Category */}
        <div className="mb-16 grid gap-16 lg:grid-cols-2">
          <div className="space-y-6">
            {isEditing ? (
              <>
                <Input
                  value={draft.name}
                  onChange={(e) => setDraft((prev) => ({ ...prev, name: e.target.value }))}
                  className="text-4xl font-bold"
                  placeholder="Product Name"
                />
                <Textarea
                  value={draft.description}
                  onChange={(e) => setDraft((prev) => ({ ...prev, description: e.target.value }))}
                  className="h-32"
                  placeholder="Product Description"
                />
                <div className="max-w-xs">
                  <Select
                    value={draft.category_id}
                    onValueChange={(value) => setDraft((prev) => ({ ...prev, category_id: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select a category" />
                    </SelectTrigger>
                    <SelectContent>
                      {categories.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </>
            ) : (
              <>
                <h1 className="text-6xl font-bold tracking-tight text-neutral-800 dark:text-neutral-200">
                  {product.name}
                </h1>
                <p className="text-pretty text-lg leading-relaxed text-neutral-600 dark:text-neutral-400">
                  {product.description}
                </p>
                {categoryName && <Badge variant="secondary">{categoryName}</Badge>}
              </>
            )}
          </div>
        </div>

        {/* Tabs Section */}
        <Tabs defaultValue="specifications" className="w-full">
          <TabsList className="mb-8 inline-flex w-auto space-x-8 rounded-none border-b border-neutral-200 bg-transparent p-0 dark:border-neutral-700">
            <TabsTrigger
              value="specifications"
              className="rounded-none border-b-2 border-transparent bg-transparent px-0 py-3 text-base font-medium data-[state=active]:border-blue-500 data-[state=active]:text-blue-600 dark:data-[state=active]:text-blue-400"
            >
              Specifications
            </TabsTrigger>
            <TabsTrigger
              value="variations"
              className="rounded-none border-b-2 border-transparent bg-transparent px-0 py-3 text-base font-medium data-[state=active]:border-blue-500 data-[state=active]:text-blue-600 dark:data-[state=active]:text-blue-400"
            >
              Variations &amp; Stock
            </TabsTrigger>
          </TabsList>

          <TabsContent value="specifications">
            <div className="grid gap-16 lg:grid-cols-2">
              <div className="space-y-8">
                {FREEFORM_SPECS.map((spec) => (
                  <div key={spec.key}>
                    <h3 className="mb-2 text-lg font-bold text-neutral-800 dark:text-neutral-200">
                      {spec.title}
                    </h3>
                    {isEditing ? (
                      <Textarea
                        value={productData[spec.key] || ''}
                        onChange={(e) =>
                          setDraft((prev) => ({
                            ...prev,
                            product_data: { ...prev.product_data, [spec.key]: e.target.value },
                          }))
                        }
                        className="h-24"
                      />
                    ) : (
                      <p className="text-neutral-600 dark:text-neutral-400">
                        {productData[spec.key]}
                      </p>
                    )}
                  </div>
                ))}
              </div>

              <Card className="h-fit border-neutral-100 bg-white shadow-lg dark:border-neutral-800 dark:bg-neutral-800">
                <CardContent className="p-6">
                  <table className="w-full">
                    <thead>
                      <tr>
                        <th className="pb-4 text-left text-sm font-medium uppercase tracking-wider text-neutral-500">
                          Specification
                        </th>
                        <th className="pb-4 text-right text-sm font-medium uppercase tracking-wider text-neutral-500">
                          Value
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-200 dark:divide-neutral-700">
                      {SPEC_ROWS.map((row) => (
                        <tr key={row.key}>
                          <td className="py-4 text-neutral-600 dark:text-neutral-400">{row.label}</td>
                          <td className="py-4 text-right text-neutral-600 dark:text-neutral-400">
                            {isEditing ? (
                              <Input
                                value={specifications[row.key] || ''}
                                onChange={(e) => setSpec(row.key, e.target.value)}
                                className="text-right"
                              />
                            ) : (
                              specifications[row.key] || ''
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="variations">
            <div className="mb-6 flex items-center justify-between">
              <p className="text-neutral-600 dark:text-neutral-400">
                {variants.length} variation{variants.length === 1 ? '' : 's'}
              </p>
              <Button
                onClick={() => {
                  setSelectedVariant(null);
                  setVariationDialogOpen(true);
                }}
              >
                <Plus className="mr-2 h-4 w-4" />
                Add Variation
              </Button>
            </div>

            {variants.length === 0 ? (
              <div className="rounded-lg border border-dashed border-neutral-200 py-12 text-center text-neutral-500 dark:border-neutral-700">
                No variations yet. Add one to start tracking stock.
              </div>
            ) : (
              <div className="grid gap-6 md:grid-cols-2">
                {variants.map((variant) => (
                  <Card
                    key={variant.id}
                    className="border-neutral-100 dark:border-neutral-800 dark:bg-neutral-800"
                  >
                    <CardContent className="p-6">
                      <div className="mb-4 flex items-start justify-between">
                        <div className="flex items-center gap-3">
                          <Package className="h-5 w-5 text-muted-foreground" />
                          <div>
                            <div className="font-semibold text-neutral-800 dark:text-neutral-200">
                              {variant.name}
                              {variant.sku && (
                                <Badge variant="outline" className="ml-2">
                                  {variant.sku}
                                </Badge>
                              )}
                            </div>
                            <div className="mt-1">
                              {Object.entries(parseAttributes(variant.attributes)).map(
                                ([key, value]) => (
                                  <Badge key={key} variant="secondary" className="mr-2">
                                    {key}: {String(value)}
                                  </Badge>
                                ),
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Edit variation"
                            onClick={() => {
                              setSelectedVariant(variant);
                              setVariationDialogOpen(true);
                            }}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Delete variation"
                            onClick={() => deleteVariant(variant)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>

                      <div className="mb-4 grid grid-cols-3 gap-4 text-sm">
                        <div>
                          <p className="text-neutral-500">Price</p>
                          <p className="font-medium">{fmtMoney(variant.price)}</p>
                        </div>
                        <div>
                          <p className="text-neutral-500">Cost</p>
                          <p className="font-medium">{fmtMoney(variant.cost_price)}</p>
                        </div>
                        <div>
                          <p className="text-neutral-500">Reorder Point</p>
                          <p className="font-medium">{Number(variant.reorder_point || 0)}</p>
                        </div>
                      </div>

                      <VariantStockTable variant={variant} branches={branches} levels={levels} />
                      <p className="mt-2 text-xs text-neutral-500">
                        Total on hand: {stockTotals.get(variant.id) || 0}
                      </p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      <ProductVariationDialog
        open={variationDialogOpen}
        onOpenChange={(isOpen) => {
          setVariationDialogOpen(isOpen);
          if (!isOpen) setSelectedVariant(null);
        }}
        variant={selectedVariant}
        onSave={saveVariant}
      />
    </main>
  );
};

export default ProductPage;
