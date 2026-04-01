// Minimal Supabase REST client that avoids localStorage/sessionStorage
// This replaces @supabase/supabase-js to bypass iframe sandbox restrictions

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://ecspoxppctlmtbchxipi.supabase.co';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_F1_Bwo7-4mkd0w2yV-ywoQ_QdDIeQVJ';

type QueryOptions = {
  ascending?: boolean;
};

class SupabaseQueryBuilder {
  private table: string;
  private filters: string[] = [];
  private selectColumns: string = '*';
  private orderByCol: string | null = null;
  private orderAsc: boolean = true;
  private limitCount: number | null = null;
  private isSingle: boolean = false;
  private insertData: any = null;
  private isInsert: boolean = false;
  private returningSelect: boolean = false;

  constructor(table: string) {
    this.table = table;
  }

  select(columns: string = '*') {
    this.selectColumns = columns;
    return this;
  }

  eq(column: string, value: any) {
    this.filters.push(`${column}=eq.${value}`);
    return this;
  }

  order(column: string, opts?: QueryOptions) {
    this.orderByCol = column;
    this.orderAsc = opts?.ascending ?? true;
    return this;
  }

  limit(count: number) {
    this.limitCount = count;
    return this;
  }

  single() {
    this.isSingle = true;
    this.limitCount = 1;
    return this;
  }

  async _execute(): Promise<{ data: any; error: any }> {
    try {
      if (this.isInsert) {
        const headers: Record<string, string> = {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': this.returningSelect ? 'return=representation' : 'return=minimal',
        };

        const resp = await fetch(`${SUPABASE_URL}/rest/v1/${this.table}`, {
          method: 'POST',
          headers,
          body: JSON.stringify(this.insertData),
        });

        if (!resp.ok) {
          const text = await resp.text();
          return { data: null, error: { message: text } };
        }

        if (this.returningSelect) {
          const json = await resp.json();
          const data = this.isSingle ? (Array.isArray(json) ? json[0] : json) : json;
          return { data, error: null };
        }

        return { data: null, error: null };
      }

      // Build query string for GET
      const params = new URLSearchParams();
      params.set('select', this.selectColumns);

      for (const f of this.filters) {
        const [key, ...rest] = f.split('=');
        params.append(key, rest.join('='));
      }

      if (this.orderByCol) {
        params.set('order', `${this.orderByCol}.${this.orderAsc ? 'asc' : 'desc'}`);
      }

      if (this.limitCount !== null) {
        params.set('limit', String(this.limitCount));
      }

      const headers: Record<string, string> = {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      };

      if (this.isSingle) {
        headers['Accept'] = 'application/vnd.pgrst.object+json';
      }

      const resp = await fetch(`${SUPABASE_URL}/rest/v1/${this.table}?${params.toString()}`, {
        method: 'GET',
        headers,
      });

      if (!resp.ok) {
        const text = await resp.text();
        return { data: null, error: { message: text } };
      }

      const data = await resp.json();
      return { data, error: null };
    } catch (err: any) {
      return { data: null, error: { message: err.message } };
    }
  }

  then(resolve: (value: { data: any; error: any }) => void, reject?: (err: any) => void) {
    return this._execute().then(resolve, reject);
  }
}

class SupabaseInsertBuilder {
  private table: string;
  private data: any;

  constructor(table: string, data: any) {
    this.table = table;
    this.data = data;
  }

  select() {
    const qb = new SupabaseQueryBuilder(this.table);
    (qb as any).isInsert = true;
    (qb as any).insertData = this.data;
    (qb as any).returningSelect = true;
    return qb;
  }

  async then(resolve: (value: { data: any; error: any }) => void, reject?: (err: any) => void) {
    const qb = new SupabaseQueryBuilder(this.table);
    (qb as any).isInsert = true;
    (qb as any).insertData = this.data;
    return qb._execute().then(resolve, reject);
  }
}

class SupabaseTableRef {
  private table: string;

  constructor(table: string) {
    this.table = table;
  }

  select(columns: string = '*') {
    const qb = new SupabaseQueryBuilder(this.table);
    qb.select(columns);
    return qb;
  }

  insert(data: any) {
    return new SupabaseInsertBuilder(this.table, data);
  }
}

class SupabaseStorageFileRef {
  private bucket: string;

  constructor(bucket: string) {
    this.bucket = bucket;
  }

  async upload(path: string, file: File): Promise<{ data: any; error: any }> {
    try {
      const resp = await fetch(`${SUPABASE_URL}/storage/v1/object/${this.bucket}/${path}`, {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        },
        body: file,
      });

      if (!resp.ok) {
        const text = await resp.text();
        return { data: null, error: { message: text } };
      }

      const data = await resp.json();
      return { data, error: null };
    } catch (err: any) {
      return { data: null, error: { message: err.message } };
    }
  }

  getPublicUrl(path: string) {
    return {
      data: {
        publicUrl: `${SUPABASE_URL}/storage/v1/object/public/${this.bucket}/${path}`,
      },
    };
  }
}

class SupabaseStorageClient {
  from(bucket: string) {
    return new SupabaseStorageFileRef(bucket);
  }
}

class SupabaseClient {
  storage = new SupabaseStorageClient();

  from(table: string) {
    return new SupabaseTableRef(table);
  }
}

export const supabase = new SupabaseClient();
