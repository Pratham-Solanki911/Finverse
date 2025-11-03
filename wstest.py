# inspect_feed.py
import importlib
pb = importlib.import_module("src.MarketDataFeedV3_pb2")

print("Module top-level names:")
print(sorted([n for n in dir(pb) if not n.startswith("_")]))

# Feed descriptor & fields
if hasattr(pb, "Feed"):
    Feed = pb.Feed
    print("\nFeed descriptor full name:", Feed.DESCRIPTOR.full_name)
    print("Feed fields:")
    for f in Feed.DESCRIPTOR.fields:
        lbl = {1:"optional",2:"required",3:"repeated"}.get(f.label, f.label)
        print(f" - {f.name} (number={f.number}, label={lbl}, type={f.type}, cpp_type={f.cpp_type})")
else:
    print("\nNo Feed message found in module.")

# Print RequestMode or Type enum members if present
for enum_name in ("RequestMode","Type","Request_Type","Mode"):
    if hasattr(pb, enum_name):
        print(f"\nEnum {enum_name} values:")
        enum_obj = getattr(pb, enum_name)
        try:
            for k, v in enum_obj.items():
                print(f" - {k} = {v}")
        except Exception:
            print("  (enum object not iterable; raw repr:)", enum_obj)
