from tools.tavily_tool import tavily_search
from tools.flight_tool import search_flights

# res  = tavily_search("Best hotels in Paris") 
# print(res)


res = search_flights("plan from New York to London on 2024-07-15 returning on 2024-07-22")
print(res)