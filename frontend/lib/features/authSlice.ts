import { createAsyncThunk, createSlice, type PayloadAction } from "@reduxjs/toolkit";
import { BASE_URL } from "@/lib/config";
import type { User } from "@/lib/types";

interface AuthState {
  user: User | null;
  accessToken: string | null;
  loading: boolean;
}

const initialState: AuthState = {
  user: null,
  accessToken: null,
  loading: true,
};

/** Silent session restore on app load, using the httpOnly refresh cookie. */
export const restoreSession = createAsyncThunk("auth/restoreSession", async () => {
  const refreshRes = await fetch(`${BASE_URL}/auth/refresh`, { method: "POST", credentials: "include" });
  if (!refreshRes.ok) return null;
  const { access } = await refreshRes.json();

  const meRes = await fetch(`${BASE_URL}/auth/me`, { headers: { Authorization: `Bearer ${access}` } });
  if (!meRes.ok) return null;

  return { user: (await meRes.json()) as User, accessToken: access as string };
});

export const login = createAsyncThunk(
  "auth/login",
  async ({ username, password }: { username: string; password: string }, { rejectWithValue }) => {
    const res = await fetch(`${BASE_URL}/auth/login`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    const data = await res.json();
    if (!res.ok) {
      // Plain, serializable payload — ApiError is reconstructed by the useAuth
      // hook so callers still get a real ApiError with status/body intact.
      return rejectWithValue({ status: res.status, body: data });
    }
    return { user: data.user as User, accessToken: data.access as string };
  }
);

export const logout = createAsyncThunk<void, void, { state: { auth: AuthState } }>(
  "auth/logout",
  async (_, { getState }) => {
    const token = getState().auth.accessToken;
    await fetch(`${BASE_URL}/auth/logout`, {
      method: "POST",
      credentials: "include",
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    }).catch(() => {});
  }
);

const authSlice = createSlice({
  name: "auth",
  initialState,
  reducers: {
    setAccessToken(state, action: PayloadAction<string | null>) {
      state.accessToken = action.payload;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(restoreSession.fulfilled, (state, action) => {
        if (action.payload) {
          state.user = action.payload.user;
          state.accessToken = action.payload.accessToken;
        }
        state.loading = false;
      })
      .addCase(restoreSession.rejected, (state) => {
        state.loading = false;
      })
      .addCase(login.fulfilled, (state, action) => {
        state.user = action.payload.user;
        state.accessToken = action.payload.accessToken;
      })
      .addCase(logout.fulfilled, (state) => {
        state.user = null;
        state.accessToken = null;
      });
  },
});

export const { setAccessToken } = authSlice.actions;
export default authSlice.reducer;
