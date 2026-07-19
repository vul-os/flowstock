import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '@/services/api';

const WorkspaceContext = createContext(null);

export function WorkspaceProvider({ children }) {
  const [boot, setBoot] = useState(null);
  const [loading, setLoading] = useState(true);
  const [dataVersion, setDataVersion] = useState(0);

  const refresh = useCallback(async () => {
    const b = await api.bootstrap();
    setBoot(b);
    setLoading(false);
    return b;
  }, []);

  useEffect(() => {
    refresh().catch((e) => {
      console.error('bootstrap failed', e);
      setLoading(false);
    });
    const off = api.onDataChanged(() => setDataVersion((v) => v + 1));
    return off;
  }, [refresh]);

  const fmtMoney = useCallback(
    (n) => {
      const symbol = boot?.currency?.symbol ?? 'R';
      const value = Number(n || 0);
      return `${symbol} ${value.toLocaleString('en-ZA', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`;
    },
    [boot],
  );

  const value = useMemo(
    () => ({
      loading,
      initialized: !!boot?.initialized,
      isDemo: api.isDemo,
      businessName: boot?.business_name || '',
      branchId: boot?.branch_id || '',
      branchName: boot?.branch_name || '',
      currency: boot?.currency || { code: 'ZAR', symbol: 'R' },
      taxRate: boot?.tax_rate ?? 15,
      nodeId: boot?.node_id || '',
      dataVersion,
      refresh,
      fmtMoney,
    }),
    [loading, boot, dataVersion, refresh, fmtMoney],
  );

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace() {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error('useWorkspace must be used within WorkspaceProvider');
  return ctx;
}

/**
 * Fetch one or more tables, refetching whenever any mutation (local or via
 * sync) bumps the data version. Returns { data: {tbl: rows[]}, loading }.
 */
export function useTables(...tables) {
  const { dataVersion } = useWorkspace();
  const [state, setState] = useState({ data: {}, loading: true });
  const key = tables.join(',');

  useEffect(() => {
    let alive = true;
    Promise.all(tables.map((t) => api.listRows(t)))
      .then((results) => {
        if (!alive) return;
        const data = {};
        tables.forEach((t, i) => (data[t] = results[i]));
        setState({ data, loading: false });
      })
      .catch((e) => {
        console.error('useTables failed', e);
        if (alive) setState((s) => ({ ...s, loading: false }));
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, dataVersion]);

  return state;
}

/** Stock levels per (variant, branch), refreshed on every data change. */
export function useStockLevels() {
  const { dataVersion } = useWorkspace();
  const [levels, setLevels] = useState([]);
  useEffect(() => {
    let alive = true;
    api
      .getStockLevels()
      .then((l) => alive && setLevels(l))
      .catch((e) => console.error('stock levels failed', e));
    return () => {
      alive = false;
    };
  }, [dataVersion]);
  return levels;
}
