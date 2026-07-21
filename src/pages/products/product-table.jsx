import React, { useState } from "react";
import {
  Pencil,
  Trash2,
  Plus,
  ChevronDown,
  ChevronRight,
  Package,
  Eye,
  SlidersHorizontal,
  ArrowLeftRight,
  AlertTriangle,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { branchBreakdown } from "@/lib/reports";
import { parseAttributes, isLowStock } from "./helpers";

/** Stock total that pops open a per-branch breakdown. */
const StockCell = ({ variant, total, levels, branchName }) => {
  const rows = branchBreakdown(levels, variant.id).filter(
    (l) => Number(l.qty) !== 0,
  );
  const low = isLowStock(variant, total);
  return (
    <div className="flex items-center justify-end gap-2">
      {low && (
        <Badge variant="destructive" className="gap-1">
          <AlertTriangle className="h-3 w-3" />
          Low stock
        </Badge>
      )}
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="sm" className="h-7 px-2 font-medium">
            Stock: {total}
            <ChevronDown className="ml-1 h-3 w-3 text-muted-foreground" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-56 p-3" align="end">
          <p className="mb-2 text-sm font-medium">Stock by branch</p>
          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No stock at any branch.
            </p>
          ) : (
            <div className="space-y-1">
              {rows.map((l) => (
                <div key={l.branch_id} className="flex justify-between text-sm">
                  <span className="text-muted-foreground">
                    {branchName(l.branch_id)}
                  </span>
                  <span className="font-medium">{l.qty}</span>
                </div>
              ))}
              <div className="mt-1 flex justify-between border-t pt-1 text-sm font-medium">
                <span>Total</span>
                <span>{total}</span>
              </div>
            </div>
          )}
          {Number(variant.reorder_point) > 0 && (
            <p className="mt-2 text-xs text-muted-foreground">
              Reorder point: {variant.reorder_point}
            </p>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
};

const ProductTable = ({
  products,
  branches,
  levels,
  stockTotals,
  fmtMoney,
  onEdit,
  onDelete,
  onAddVariation,
  onEditVariation,
  onDeleteVariation,
  onAdjustStock,
  onTransferStock,
}) => {
  const [expandedProducts, setExpandedProducts] = useState({});
  const navigate = useNavigate();

  const branchName = (id) => branches.find((b) => b.id === id)?.name || id;

  const toggleProductExpansion = (productId) => {
    setExpandedProducts((prev) => ({ ...prev, [productId]: !prev[productId] }));
  };

  if (products.length === 0) {
    return (
      <div className="py-12 text-center text-muted-foreground">
        No products match the current filters.
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-10"></TableHead>
          <TableHead>Name</TableHead>
          <TableHead>Description</TableHead>
          <TableHead>Category</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {products.map((product) => (
          <React.Fragment key={product.id}>
            <TableRow className="border-b-0">
              <TableCell>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => toggleProductExpansion(product.id)}
                >
                  {expandedProducts[product.id] ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronRight className="h-4 w-4" />
                  )}
                </Button>
              </TableCell>
              <TableCell className="font-medium">
                {product.name}
                <Badge variant="outline" className="ml-2">
                  {product.variants.length} variation
                  {product.variants.length === 1 ? "" : "s"}
                </Badge>
                {product.variants.some((v) =>
                  isLowStock(v, stockTotals.get(v.id) || 0),
                ) && (
                  <Badge variant="destructive" className="ml-2">
                    Low stock
                  </Badge>
                )}
              </TableCell>
              <TableCell className="max-w-md truncate">
                {product.description}
              </TableCell>
              <TableCell>
                {product.categoryName && (
                  <Badge variant="secondary">{product.categoryName}</Badge>
                )}
              </TableCell>
              <TableCell>
                {/* Four peer actions, all icon-only. "Add variation" used to be
                    a labelled outline button, which put ten heavy buttons down
                    the right edge and made them the loudest thing on a page
                    whose subject is the catalogue. */}
                <div className="flex justify-end gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    title="Add variation"
                    onClick={() => onAddVariation(product)}
                  >
                    <Plus className="h-4 w-4" />
                    <span className="sr-only">
                      Add variation to {product.name}
                    </span>
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    title="View details"
                    onClick={() => navigate(`/products/${product.id}`)}
                  >
                    <Eye className="h-4 w-4" />
                    <span className="sr-only">View {product.name}</span>
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    title="Edit product"
                    onClick={() => onEdit(product)}
                  >
                    <Pencil className="h-4 w-4" />
                    <span className="sr-only">Edit {product.name}</span>
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    title="Delete product"
                    onClick={() => onDelete(product)}
                  >
                    <Trash2 className="h-4 w-4" />
                    <span className="sr-only">Delete {product.name}</span>
                  </Button>
                </div>
              </TableCell>
            </TableRow>
            {expandedProducts[product.id] && (
              <TableRow>
                <TableCell colSpan={5} className="p-0">
                  <div className="bg-muted/30 py-2">
                    <div className="grid grid-cols-1 gap-2 px-4">
                      {product.variants.length > 0 ? (
                        product.variants.map((variant) => {
                          const total = stockTotals.get(variant.id) || 0;
                          return (
                            <div
                              key={variant.id}
                              className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-background p-3 shadow-sm"
                            >
                              <div className="flex items-center gap-4">
                                <Package className="h-5 w-5 text-muted-foreground" />
                                <div>
                                  <div className="font-medium">
                                    {variant.name}
                                    {variant.sku && (
                                      <Badge variant="outline" className="ml-2">
                                        {variant.sku}
                                      </Badge>
                                    )}
                                  </div>
                                  <div className="mt-1 text-sm text-muted-foreground">
                                    {Object.entries(
                                      parseAttributes(variant.attributes),
                                    ).map(([key, value]) => (
                                      <Badge
                                        key={key}
                                        variant="secondary"
                                        className="mr-2"
                                      >
                                        {key}: {String(value)}
                                      </Badge>
                                    ))}
                                  </div>
                                </div>
                              </div>
                              <div className="flex items-center gap-4">
                                <div className="text-right">
                                  <div className="font-medium">
                                    {fmtMoney(variant.price)}
                                  </div>
                                  <div className="text-xs text-muted-foreground">
                                    Cost: {fmtMoney(variant.cost_price)}
                                  </div>
                                </div>
                                <StockCell
                                  variant={variant}
                                  total={total}
                                  levels={levels}
                                  branchName={branchName}
                                />
                                <div className="flex gap-1">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    title="Adjust stock"
                                    onClick={() => onAdjustStock(variant)}
                                  >
                                    <SlidersHorizontal className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    title="Transfer between branches"
                                    onClick={() => onTransferStock(variant)}
                                  >
                                    <ArrowLeftRight className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    title="Edit variation"
                                    onClick={() =>
                                      onEditVariation(product, variant)
                                    }
                                  >
                                    <Pencil className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    title="Delete variation"
                                    onClick={() => onDeleteVariation(variant)}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              </div>
                            </div>
                          );
                        })
                      ) : (
                        <div className="py-4 text-center text-muted-foreground">
                          No variations added yet
                        </div>
                      )}
                    </div>
                  </div>
                </TableCell>
              </TableRow>
            )}
          </React.Fragment>
        ))}
      </TableBody>
    </Table>
  );
};

export default ProductTable;
