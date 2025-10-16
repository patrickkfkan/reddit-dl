import { DownloadableImage } from "../../entities/Common";
import { Logger, LogLevel } from "../../utils/logging";
import { commonLog } from "../../utils/logging/Logger";
import ObjectHelper from "../../utils/ObjectHelper";
import { PostParserMixin } from "./PostParserMixin";
import { SubredditParserMixin } from "./SubredditParserMixin";
import { UserParserMixin } from "./UserParserMixin";

export type APIDataParserConstructor = new (...args: any[]) => APIDataParserBase;

export type APIDataParserInstance = InstanceType<typeof APIDataParser>;

export class APIDataParserBase {
  name = 'APIDataParser';

  protected logger?: Logger | null;
  
  constructor(logger?: Logger | null) {
    this.logger = logger;
  }

  protected log(level: LogLevel, ...msg: any[]) {
    const limiterStopOnError = msg.find(
      (m) => m instanceof Error && m.message === 'LimiterStopOnError'
    );
    if (limiterStopOnError) {
      return;
    }
    commonLog(this.logger, level, this.name, ...msg);
  }


  protected mapDownloadableImage(
    data: any,
    srcProperty: string
  ): DownloadableImage | null {
    const src = ObjectHelper.getProperty(data, srcProperty);
    return src ? { src } : null;
  }
}

const APIDataParser = PostParserMixin(SubredditParserMixin(UserParserMixin(APIDataParserBase)));

export default APIDataParser;
