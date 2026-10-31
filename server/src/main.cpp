#include <drogon/drogon.h>

int main()
{
    drogon::app()
        .addListener("0.0.0.0", 3000)
        .registerHandler(
            "/api/health",
            [](const drogon::HttpRequestPtr&,
               std::function<void(const drogon::HttpResponsePtr&)>&& callback)
            {
                Json::Value response;
                response["status"] = "ok";
                response["service"] = "map-backend";

                callback(
                    drogon::HttpResponse::newHttpJsonResponse(response)
                );
            },
            {drogon::Get}
        )
        .run();

    return 0;
}