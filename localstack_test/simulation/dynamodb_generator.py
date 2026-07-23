import random
import json
from datetime import datetime, timezone
from .base_generator import BaseGenerator
from .logger import log
from .state_manager import state
from .event_bus import event_bus
from .cost_engine import cost_engine

TABLE_DEFS = {
    "Employees": {
        "pk": "EmpID",
        "sk": None,
        "fields": ["Name", "Dept", "Role", "Salary", "Email", "Status"],
    },
    "Orders": {
        "pk": "OrderID",
        "sk": None,
        "fields": ["CustomerID", "Product", "Amount", "Status", "Quantity", "ShippingAddress"],
    },
    "Products": {
        "pk": "ProductID",
        "sk": None,
        "fields": ["Name", "Price", "Stock", "Category", "Rating", "Description"],
    },
}

SAMPLE_DATA = {
    "Dept": ["Engineering", "DevOps", "HR", "Finance", "Marketing", "Security", "QA", "Operations"],
    "Status": ["active", "pending", "completed", "shipped", "delivered", "cancelled", "refunded"],
    "Category": ["Electronics", "Office", "Software", "Services", "Hardware"],
    "Role": ["Engineer", "Manager", "Director", "VP", "Analyst", "Architect", "Lead"],
}


class DynamoDBGenerator(BaseGenerator):
    def __init__(self):
        super().__init__("DynamoDB", 10)

    def generate(self):
        dynamo = self.get_client("dynamodb")

        tables = list(TABLE_DEFS.keys())
        table_name = random.choice(tables)
        table_def = TABLE_DEFS[table_name]

        action = random.choices(
            ["insert", "update", "delete", "query"],
            weights=[40, 25, 10, 25],
        )[0]

        if action == "insert":
            item = {table_def["pk"]: {"S": f"{table_name[:3].upper()}-{random.randint(1000,99999)}"}}
            for field in table_def["fields"]:
                if field in SAMPLE_DATA:
                    item[field] = {"S": random.choice(SAMPLE_DATA[field])}
                elif field == "Salary":
                    item[field] = {"N": str(random.randint(40000, 180000))}
                elif field == "Price":
                    item[field] = {"N": str(round(random.uniform(10, 5000), 2))}
                elif field == "Amount":
                    item[field] = {"N": str(round(random.uniform(50, 2500), 2))}
                elif field == "Stock":
                    item[field] = {"N": str(random.randint(0, 500))}
                elif field == "Rating":
                    item[field] = {"N": str(round(random.uniform(1, 5), 1))}
                elif field == "Quantity":
                    item[field] = {"N": str(random.randint(1, 10))}
                else:
                    item[field] = {"S": f"sample-{random.randint(1,999)}"}
            try:
                dynamo.put_item(TableName=table_name, Item=item)
                cost_engine.record_realistic("DynamoDB")
                state.increment("dynamodb_write")
                pk_val = item[table_def["pk"]]["S"]
                log.info(f"Inserted into {table_name} ({pk_val})", component=self.name)
                event_bus.publish("dynamodb.put_item", {"table": table_name, "pk": pk_val})
            except Exception:
                pass

        elif action == "update":
            try:
                resp = dynamo.scan(TableName=table_name, Limit=5)
                items = resp.get("Items", [])
                if items:
                    target = random.choice(items)
                    pk_val = target[table_def["pk"]]["S"]
                    update_field = random.choice(table_def["fields"])
                    if update_field in SAMPLE_DATA:
                        new_val = random.choice(SAMPLE_DATA[update_field])
                        dynamo.update_item(
                            TableName=table_name,
                            Key={table_def["pk"]: {"S": pk_val}},
                            UpdateExpression=f"SET #f = :v",
                            ExpressionAttributeNames={"#f": update_field},
                            ExpressionAttributeValues={":v": {"S": new_val}},
                        )
                        cost_engine.record_realistic("DynamoDB")
                        log.info(f"Updated {table_name} {pk_val}: {update_field}={new_val}", component=self.name)
                        event_bus.publish("dynamodb.update_item", {"table": table_name, "pk": pk_val})
            except Exception:
                pass

        elif action == "delete":
            try:
                resp = dynamo.scan(TableName=table_name, Limit=5)
                items = resp.get("Items", [])
                if items:
                    target = random.choice(items)
                    pk_val = target[table_def["pk"]]["S"]
                    dynamo.delete_item(
                        TableName=table_name,
                        Key={table_def["pk"]: {"S": pk_val}},
                    )
                    cost_engine.record_realistic("DynamoDB")
                    log.info(f"Deleted from {table_name} ({pk_val})", component=self.name)
                    event_bus.publish("dynamodb.delete_item", {"table": table_name, "pk": pk_val})
            except Exception:
                pass

        elif action == "query":
            try:
                resp = dynamo.scan(TableName=table_name, Limit=1)
                items = resp.get("Items", [])
                if items:
                    pk_val = items[0][table_def["pk"]]["S"]
                    dynamo.get_item(TableName=table_name, Key={table_def["pk"]: {"S": pk_val}})
                    cost_engine.record_realistic("DynamoDB")
                    log.info(f"Queried {table_name} ({pk_val})", component=self.name)
            except Exception:
                pass

    def discover_existing(self):
        dynamo = self.get_client("dynamodb")
        try:
            tables = dynamo.list_tables().get("TableNames", [])
            for t in tables:
                if t not in TABLE_DEFS:
                    TABLE_DEFS[t] = {"pk": "id", "sk": None, "fields": ["data"]}
            log.info(f"Discovered {len(tables)} DynamoDB tables", component=self.name)
        except Exception:
            pass
