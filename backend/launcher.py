import sys
import multiprocessing
import importlib
from pathlib import Path

# Add src to path for relative imports within modules
sys.path.append(str(Path(__file__).parent / "src"))

def main():
    # Windows freeze support for multiprocessing
    multiprocessing.freeze_support()

    if len(sys.argv) > 1 and (sys.argv[1] == "-m" or sys.argv[1] == "--module"):
        if len(sys.argv) < 3:
            print("Usage: launcher.exe -m <module_name> [args...]")
            sys.exit(1)
        
        module_name = sys.argv[2]
        # Shift args to simulate running as the module
        sys.argv = [sys.argv[0]] + sys.argv[3:]
        
        try:
            mod = importlib.import_module(module_name)
            if hasattr(mod, "main"):
                mod.main()
            else:
                print(f"Error: Module {module_name} does not have a main() function.")
                sys.exit(1)
        except ImportError as e:
            print(f"Error importing module {module_name}: {e}")
            sys.exit(1)
        except Exception as e:
            print(f"Error executing module {module_name}: {e}")
            sys.exit(1)
    else:
        # Default: Run the main orchestrator
        from pipeline import main as orchestrator_main
        orchestrator_main()

if __name__ == "__main__":
    main()
