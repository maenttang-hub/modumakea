import pytest
import copy

_initial_cache = None

@pytest.fixture(autouse=True)
def reset_symbol_cache():
    global _initial_cache
    from kicad_sch_api.library.cache import get_symbol_cache, set_symbol_cache
    
    # Reset/clear any dirty state before running the test
    if _initial_cache is not None:
        try:
            cache = get_symbol_cache()
            cache.clear_cache()
            cache._library_paths = set(_initial_cache["library_paths"])
            cache._library_index = dict(_initial_cache["library_index"])
            cache._lib_stats = dict(_initial_cache["lib_stats"])
        except Exception:
            # If something fails, reset the singleton completely
            set_symbol_cache(None)
            _initial_cache = None

    # Get/initialize cache for current test
    cache = get_symbol_cache()
    
    if _initial_cache is None:
        # Save a snapshot of the clean, initially-discovered libraries
        _initial_cache = {
            "library_paths": set(cache._library_paths),
            "library_index": dict(cache._library_index),
            "lib_stats": dict(cache._lib_stats),
        }
    
    yield
    
    # Restore the initial state after the test to prevent leaks to subsequent tests
    try:
        cache.clear_cache()
        cache._library_paths = set(_initial_cache["library_paths"])
        cache._library_index = dict(_initial_cache["library_index"])
        cache._lib_stats = dict(_initial_cache["lib_stats"])
    except Exception:
        set_symbol_cache(None)
        _initial_cache = None
